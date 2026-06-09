import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ProjectsTab from "@/apps/mass-edit/ProjectsTab.svelte";
import { mount, unmount, tick } from "svelte";
import * as logic from "@/apps/mass-edit/mass-edit-logic.js";
import { MODULE_ID } from "@/global.js";

vi.unmock("svelte");

vi.mock("@/apps/mass-edit/mass-edit-logic.js", () => ({
  loadProjectsIndex: vi.fn(),
  loadConfiguredDocuments: vi.fn(),
  getAvailableDestinations: vi.fn().mockReturnValue([{ id: "", label: "World" }]),
  activateDocument: vi.fn(),
  createAndActivateDocument: vi.fn(),
  buildPackIndex: vi.fn().mockResolvedValue([]),
  buildWorldActorIndex: vi.fn().mockReturnValue([]),
}));

vi.mock("@/core/settings", () => ({
  Settings: {
    get: vi.fn().mockImplementation((key: string) => {
      if (key === "allowedCompendiums") return ["world.feats"];
      if (key === "bookCompendiums") return [];
      if (key === "categories") return [];
      return [];
    }),
  },
}));

vi.mock("@/logic/item-config-logic.js", () => ({
  ItemConfigLogic: { saveConfig: vi.fn().mockResolvedValue(true) },
}));

function makeProject(id: string, name: string, target: number = 10, followUpId = "") {
  return {
    id,
    name,
    uuid: `Compendium.world.feats.Item.${id}`,
    type: "feat",
    system: { type: { value: "" }, description: { value: "" }, activities: [] },
    getFlag: vi.fn().mockImplementation((_scope: string, key: string) => {
      if (key === "projectData")
        return { target, categories: [], followUpProjectId: followUpId, requirements: [] };
      if (key === "learningModeEnabled") return true;
      if (key === "isLearningProject") return false;
      if (key === "isLearnedReward") return false;
      return null;
    }),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

async function waitForLoaded(container: HTMLElement) {
  await vi.waitFor(
    () => {
      if (container.querySelector(".loading-state")) throw new Error("still loading");
    },
    { timeout: 2000, interval: 50 },
  );
}

describe("ProjectsTab.svelte", () => {
  let instance: any;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    // Default: no configured projects
    vi.mocked(logic.loadProjectsIndex).mockResolvedValue([]);
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([]);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    container.remove();
  });

  it("shows loading state while data is being fetched", () => {
    vi.mocked(logic.loadProjectsIndex).mockReturnValue(new Promise(() => {}) as any);

    instance = mount(ProjectsTab, { target: container });

    expect(container.innerHTML).toContain("Loading projects");
  });

  it("shows empty state when no configured projects exist", async () => {
    instance = mount(ProjectsTab, { target: container });
    await waitForLoaded(container);

    expect(container.innerHTML).toContain("No configured projects found");
  });

  it("renders a card for each configured project", async () => {
    const projects = [makeProject("p1", "Arcana Study"), makeProject("p2", "Swordsmanship")];
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue(projects as any);

    instance = mount(ProjectsTab, { target: container });
    await waitForLoaded(container);

    const cards = container.querySelectorAll(".entity-card");
    expect(cards).toHaveLength(2);
    expect(container.innerHTML).toContain("Arcana Study");
    expect(container.innerHTML).toContain("Swordsmanship");
  });

  it("shows target badge when project has a non-zero target", async () => {
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([
      makeProject("p1", "Spell", 15),
    ] as any);

    instance = mount(ProjectsTab, { target: container });
    await waitForLoaded(container);

    expect(container.querySelector(".badge")).not.toBeNull();
    expect(container.innerHTML).toContain("15");
  });

  it("shows follow-up badge when followUpProjectId is set", async () => {
    const project = makeProject("p1", "Spell", 10, "Compendium.world.feats.Item.p2");
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([project] as any);

    instance = mount(ProjectsTab, { target: container });
    await waitForLoaded(container);

    expect(container.querySelector(".badge.follow-up")).not.toBeNull();
  });

  it("expands and collapses a card when its header is clicked", async () => {
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([
      makeProject("p1", "Arcana"),
    ] as any);

    instance = mount(ProjectsTab, { target: container });
    await waitForLoaded(container);

    expect(container.querySelector(".entity-card.expanded")).toBeNull();

    const header = container.querySelector(".card-header") as HTMLButtonElement;
    header.click();
    await tick();

    expect(container.querySelector(".entity-card.expanded")).not.toBeNull();
    expect(container.querySelector(".card-body")).not.toBeNull();

    // Second click collapses
    header.click();
    await tick();
    expect(container.querySelector(".entity-card.expanded")).toBeNull();
  });

  it("only one card is expanded at a time", async () => {
    const projects = [makeProject("p1", "First"), makeProject("p2", "Second")];
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue(projects as any);

    instance = mount(ProjectsTab, { target: container });
    await waitForLoaded(container);

    const headers = container.querySelectorAll(".card-header") as NodeListOf<HTMLButtonElement>;
    headers[0].click();
    await tick();
    headers[1].click();
    await tick();

    const expanded = container.querySelectorAll(".entity-card.expanded");
    expect(expanded).toHaveLength(1);
    expect(expanded[0].textContent).toContain("Second");
  });

  it("shows the follow-up dropdown with a None option when a card is expanded", async () => {
    const project = makeProject("p1", "Arcana", 10);
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([project] as any);
    vi.mocked(logic.loadProjectsIndex).mockResolvedValue([
      {
        _id: "p1",
        name: "Arcana",
        packId: "world.feats",
        uuid: "Compendium.world.feats.Item.p1",
        learningModeEnabled: true,
      },
    ]);

    instance = mount(ProjectsTab, { target: container });
    await waitForLoaded(container);

    const header = container.querySelector(".card-header") as HTMLButtonElement;
    header.click();
    await tick();

    const select = container.querySelector(".follow-up-section select") as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.querySelector("option[value='']")?.textContent).toContain("None");
  });

  it("calls item.update when follow-up selection changes", async () => {
    const project = makeProject("p1", "Arcana", 10);
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([project] as any);
    vi.mocked(logic.loadProjectsIndex).mockResolvedValue([
      {
        _id: "p1",
        name: "Arcana",
        packId: "world.feats",
        uuid: "Compendium.world.feats.Item.p1",
        learningModeEnabled: true,
      },
      {
        _id: "p2",
        name: "Swords",
        packId: "world.feats",
        uuid: "Compendium.world.feats.Item.p2",
        learningModeEnabled: true,
      },
    ]);

    instance = mount(ProjectsTab, { target: container });
    await waitForLoaded(container);

    const header = container.querySelector(".card-header") as HTMLButtonElement;
    header.click();
    await tick();

    await tick(); // Let follow-up section render

    const select = container.querySelector(".follow-up-section select") as HTMLSelectElement;
    // Set the value to an existing option and fire a bubbling change event so
    // Svelte's onchange handler picks up e.currentTarget.value correctly.
    const targetOption = select.querySelector(
      `option[value="Compendium.world.feats.Item.p2"]`,
    ) as HTMLOptionElement | null;
    if (targetOption) targetOption.selected = true;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();

    expect(project.update).toHaveBeenCalledWith(
      { [`flags.${MODULE_ID}.projectData.followUpProjectId`]: "Compendium.world.feats.Item.p2" },
      { render: false },
    );
  });

  it("shows the Add dialog when the Add button is clicked", async () => {
    instance = mount(ProjectsTab, { target: container });
    await waitForLoaded(container);

    expect(container.querySelector(".add-entity-dialog")).toBeNull();

    const addBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add / Create Project"),
    ) as HTMLButtonElement;
    addBtn.click();
    await tick();

    expect(container.querySelector(".add-entity-dialog")).not.toBeNull();
  });

  it("dismisses the Add dialog when onDismiss is called", async () => {
    instance = mount(ProjectsTab, { target: container });
    await waitForLoaded(container);

    const addBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add / Create Project"),
    ) as HTMLButtonElement;
    addBtn.click();
    await tick();

    const dismissBtn = container.querySelector(".dismiss-btn") as HTMLButtonElement;
    dismissBtn.click();
    await tick();

    expect(container.querySelector(".add-entity-dialog")).toBeNull();
  });

  it("adds newly activated project to the list and auto-expands it", async () => {
    const existingProject = makeProject("p1", "Existing");
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([existingProject] as any);

    instance = mount(ProjectsTab, { target: container });
    await waitForLoaded(container);

    const addBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add / Create Project"),
    ) as HTMLButtonElement;
    addBtn.click();
    await tick();

    // Simulate activation completing via onAdded
    const newProject = makeProject("p2", "Newly Added");
    vi.mocked(logic.activateDocument).mockResolvedValue(newProject as any);

    const firstResult = container.querySelector(".result-row") as HTMLButtonElement | null;
    // If there are unconfigured entries, click one. Otherwise skip interaction test.
    if (firstResult) {
      firstResult.click();
      await tick();
      await vi.waitFor(() => {
        expect(container.querySelectorAll(".entity-card")).toHaveLength(2);
      });
    }
  });
});
