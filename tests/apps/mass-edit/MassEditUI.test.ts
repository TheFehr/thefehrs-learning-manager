import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import MassEditUI from "@/apps/mass-edit/MassEditUI.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

vi.mock("@/apps/mass-edit/mass-edit-logic.js", () => ({
  loadProjectsIndex: vi.fn().mockResolvedValue([]),
  loadTeachersIndex: vi.fn().mockResolvedValue([]),
  loadBooksIndex: vi.fn().mockResolvedValue([]),
  loadConfiguredDocuments: vi.fn().mockResolvedValue([]),
  buildPackIndex: vi.fn().mockResolvedValue([]),
  buildWorldActorIndex: vi.fn().mockReturnValue([]),
  getAvailableDestinations: vi.fn().mockReturnValue([]),
  activateDocument: vi.fn(),
  createAndActivateDocument: vi.fn(),
}));

vi.mock("@/core/settings", () => ({
  Settings: {
    get: vi.fn().mockImplementation((key: string) => {
      if (key === "allowedCompendiums") return [];
      if (key === "teacherCompendiums") return [];
      if (key === "bookCompendiums") return [];
      if (key === "timeUnits") return [];
      if (key === "scanWorldActors") return false;
      return [];
    }),
  },
}));

describe("MassEditUI.svelte", () => {
  let instance: any;
  let target: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
  });

  it("renders all three tab buttons", async () => {
    instance = mount(MassEditUI, { target });
    await tick();

    const tabButtons = target.querySelectorAll(".tab-btn");
    expect(tabButtons).toHaveLength(3);

    const labels = Array.from(tabButtons).map((b) => b.textContent?.trim());
    expect(labels.some((l) => l?.includes("Projects"))).toBe(true);
    expect(labels.some((l) => l?.includes("Teachers"))).toBe(true);
    expect(labels.some((l) => l?.includes("Books"))).toBe(true);
  });

  it("shows the Projects tab by default", async () => {
    instance = mount(MassEditUI, { target });
    await tick();

    const activeBtn = target.querySelector(".tab-btn.active");
    expect(activeBtn?.textContent?.trim()).toContain("Projects");
    expect(target.querySelector(".projects-tab")).not.toBeNull();

    // The tab button and its panel must reference each other by id, not just
    // look connected visually - aria-controls/aria-labelledby is how a
    // screen reader actually resolves the relationship.
    expect(activeBtn?.getAttribute("id")).toBe("tab-projects");
    expect(activeBtn?.getAttribute("aria-controls")).toBe("tabpanel-projects");
    const panel = target.querySelector("#tabpanel-projects");
    expect(panel?.getAttribute("role")).toBe("tabpanel");
    expect(panel?.getAttribute("aria-labelledby")).toBe("tab-projects");
    expect(panel?.hasAttribute("hidden")).toBe(false);

    // Every tab's aria-controls target must resolve to a real element at all
    // times, not just while that tab is active - otherwise a screen reader
    // can't follow the relationship for the tabs a user hasn't clicked yet.
    for (const tabId of ["teachers", "books"]) {
      const inactivePanel = target.querySelector(`#tabpanel-${tabId}`);
      expect(inactivePanel).not.toBeNull();
      expect(inactivePanel?.hasAttribute("hidden")).toBe(true);
    }
  });

  it("switches to the Teachers tab when clicked", async () => {
    instance = mount(MassEditUI, { target });
    await tick();

    const teachersBtn = Array.from(target.querySelectorAll(".tab-btn")).find((b) =>
      b.textContent?.includes("Teachers"),
    ) as HTMLButtonElement;
    teachersBtn.click();
    await tick();

    expect(target.querySelector(".teachers-tab")).not.toBeNull();
    expect(target.querySelector(".projects-tab")).toBeNull();
    expect(teachersBtn.classList.contains("active")).toBe(true);
  });

  it("switches to the Books tab when clicked", async () => {
    instance = mount(MassEditUI, { target });
    await tick();

    const booksBtn = Array.from(target.querySelectorAll(".tab-btn")).find((b) =>
      b.textContent?.includes("Books"),
    ) as HTMLButtonElement;
    booksBtn.click();
    await tick();

    expect(target.querySelector(".books-tab")).not.toBeNull();
    expect(target.querySelector(".projects-tab")).toBeNull();
    expect(booksBtn.classList.contains("active")).toBe(true);
  });

  it("navigates back to Projects after switching away", async () => {
    instance = mount(MassEditUI, { target });
    await tick();

    const buttons = Array.from(target.querySelectorAll(".tab-btn")) as HTMLButtonElement[];
    const teachersBtn = buttons.find((b) => b.textContent?.includes("Teachers"))!;
    const projectsBtn = buttons.find((b) => b.textContent?.includes("Projects"))!;

    teachersBtn.click();
    await tick();
    projectsBtn.click();
    await tick();

    expect(target.querySelector(".projects-tab")).not.toBeNull();
    expect(target.querySelector(".teachers-tab")).toBeNull();
    expect(projectsBtn.classList.contains("active")).toBe(true);
  });
});
