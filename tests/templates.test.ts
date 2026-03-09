import { describe, it, expect, beforeAll } from "vitest";
import Handlebars from "handlebars";
import { readFileSync } from "fs";
import { join } from "path";

describe("Handlebars Templates", () => {
  let matrixConfigTemplate: HandlebarsTemplateDelegate;
  let learningTabTemplate: HandlebarsTemplateDelegate;
  let partyTabTemplate: HandlebarsTemplateDelegate;

  beforeAll(() => {
    // Load and compile matrix-config template
    const matrixConfigPath = join(__dirname, "../public/templates/matrix-config.hbs");
    const matrixConfigSource = readFileSync(matrixConfigPath, "utf-8");
    matrixConfigTemplate = Handlebars.compile(matrixConfigSource);

    // Load and compile learning-tab template
    const learningTabPath = join(__dirname, "../public/templates/learning-tab.hbs");
    const learningTabSource = readFileSync(learningTabPath, "utf-8");
    learningTabTemplate = Handlebars.compile(learningTabSource);

    // Load and compile party-tab template
    const partyTabPath = join(__dirname, "../public/templates/party-tab.hbs");
    const partyTabSource = readFileSync(partyTabPath, "utf-8");
    partyTabTemplate = Handlebars.compile(partyTabSource);

    // Register any helpers used in the template
    // Note: Foundry VTT provides some helpers like `selectOptions` and `checked`
    // We need to mock them for the test to work
    Handlebars.registerHelper("selectOptions", (choices, options) => {
      let html = "";
      const nameAttr = options.hash.nameAttr || "id";
      const labelAttr = options.hash.labelAttr || "name";
      const selectedValue = options.hash.selected;

      if (Array.isArray(choices)) {
        for (const choice of choices) {
          const value = choice[nameAttr];
          const label = choice[labelAttr];
          const selected = selectedValue === value ? " selected" : "";
          html += `<option value="${value}"${selected}>${label}</option>`;
        }
      } else {
        for (const [key, value] of Object.entries(choices)) {
          const selected = selectedValue === key ? " selected" : "";
          html += `<option value="${key}"${selected}>${value}</option>`;
        }
      }
      return new Handlebars.SafeString(html);
    });

    Handlebars.registerHelper("checked", (value) => {
      return value ? "checked" : "";
    });
  });

  it("should render Global Rules correctly", () => {
    const data = {
      choices: {
        method1: "Method 1",
        method2: "Method 2",
      },
      rules: {
        method: "method1",
        checkFormula: "1d20 + @mod",
        checkDC: 15,
      },
      timeUnits: [],
      tiers: [],
      projects: [],
    };

    const rendered = matrixConfigTemplate(data);
    const container = document.createElement("div");
    container.innerHTML = rendered;

    const select = container.querySelector('select[name="rules.method"]');
    expect(select).not.toBeNull();
    expect(select?.querySelector('option[value="method1"]')?.hasAttribute("selected")).toBe(true);

    const checkFormulaInput = container.querySelector(
      'input[name="rules.checkFormula"]',
    ) as HTMLInputElement;
    expect(checkFormulaInput?.value).toBe("1d20 + @mod");

    const checkDCInput = container.querySelector('input[name="rules.checkDC"]') as HTMLInputElement;
    expect(checkDCInput?.value).toBe("15");
  });

  it("should render Time Units table correctly", () => {
    const data = {
      choices: {},
      rules: {},
      timeUnits: [
        { id: "day", name: "Day", short: "d", ratio: 1, isBulk: true },
        { id: "hour", name: "Hour", short: "h", ratio: 8, isBulk: false },
      ],
      tiers: [],
      projects: [],
    };

    const rendered = matrixConfigTemplate(data);
    const container = document.createElement("div");
    container.innerHTML = rendered;

    const rows = container.querySelectorAll("table.tidy-table tr");
    // Header + 2 data rows
    expect(rows.length).toBeGreaterThanOrEqual(3);

    const dayNameInput = container.querySelector(
      'input[name="timeUnits.day.name"]',
    ) as HTMLInputElement;
    expect(dayNameInput?.value).toBe("Day");

    const dayBulkCheckbox = container.querySelector(
      'input[name="timeUnits.day.isBulk"]',
    ) as HTMLInputElement;
    expect(dayBulkCheckbox?.hasAttribute("checked")).toBe(true);

    const hourBulkCheckbox = container.querySelector(
      'input[name="timeUnits.hour.isBulk"]',
    ) as HTMLInputElement;
    expect(hourBulkCheckbox?.hasAttribute("checked")).toBe(false);
  });

  it("should render Learning Tab with active and completed projects", () => {
    const data = {
      formattedBank: "10 Days",
      library: [{ id: "proj1", label: "Project 1 (100)" }],
      activeProjects: [
        {
          id: "active1",
          name: "Active Project 1",
          guidanceType: "Expert",
          progress: 50,
          maxProgress: 100,
          percent: 50,
        },
      ],
      timeUnits: [{ id: "day", name: "Day", short: "d" }],
      completedProjects: [{ name: "Completed Project 1" }],
    };

    const rendered = learningTabTemplate(data);
    const container = document.createElement("div");
    container.innerHTML = rendered;

    // Check bank display
    expect(container.textContent).toContain("Available Downtime: 10 Days");

    // Check library select
    const select = container.querySelector("select.project-selector");
    const option = select?.querySelector('option[value="proj1"]');
    expect(option).not.toBeNull();
    expect(option?.textContent).toContain("Project 1 (100)");

    // Check active project
    const activeProjectName = container.querySelector(".active-projects-list .cell-name");
    expect(activeProjectName?.textContent).toBe("Active Project 1");
    expect(container.querySelector(".active-projects-list")?.textContent).toContain("Expert");

    // Check progress bar
    const progressText = container
      .querySelector(".active-projects-list")
      ?.textContent?.replace(/\s+/g, " ");
    expect(progressText).toContain("50 / 100");
    const progressFill = container.querySelector(".t5e-progress-fill") as HTMLElement;
    expect(progressFill?.style.width).toBe("50%");

    // Check action buttons
    const button = container.querySelector("button.bulk-train");
    expect(button?.getAttribute("data-id")).toBe("active1");
    expect(button?.getAttribute("data-unit")).toBe("day");
    expect(button?.textContent).toContain("d");

    // Check completed projects
    const completedZone = container.querySelector(".completed-projects-zone");
    expect(completedZone).not.toBeNull();
    expect(completedZone?.textContent).toContain("Completed Project 1");
  });

  it("should render Party Learning Tab with sidebar correctly", () => {
    const data = {
      isGM: true,
      members: [
        {
          id: "actor1",
          name: "Esha",
          img: "ui/particles/leaf3.png",
          currency: { gp: 4371 },
          formattedBank: "10 Days",
          projects: [
            {
              id: "proj1",
              name: "Ancient Lore",
              progress: 50,
              maxProgress: 100,
              guidanceTierId: "tier1",
            },
          ],
        },
      ],
      tierOptions: { tier1: "Expert (+2)" },
    };

    const rendered = partyTabTemplate(data);
    const container = document.createElement("div");
    container.innerHTML = rendered;

    // Check main content
    expect(container.querySelector(".learning-main-content")).not.toBeNull();
    expect(container.querySelector(".project-name")?.textContent).toBe("Ancient Lore");

    // Check sidebar
    const sidebar = container.querySelector(".sidebar");
    expect(sidebar).not.toBeNull();
    expect(sidebar?.querySelector(".font-label-medium")?.textContent).toBe("Esha");
    expect(sidebar?.querySelector(".actor-currency")?.textContent).toContain("4371");
    expect(sidebar?.querySelector(".actor-currency")?.textContent).toContain("gp");
    expect(sidebar?.querySelector("img")?.getAttribute("src")).toBe("ui/particles/leaf3.png");
  });
});
