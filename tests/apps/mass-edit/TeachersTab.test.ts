import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TeachersTab from "@/apps/mass-edit/TeachersTab.svelte";
import { mount, unmount, tick } from "svelte";
import * as logic from "@/apps/mass-edit/mass-edit-logic.js";

vi.unmock("svelte");

vi.mock("@/apps/mass-edit/mass-edit-logic.js", () => ({
  loadTeachersIndex: vi.fn(),
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
      if (key === "teacherCompendiums") return ["world.teachers"];
      if (key === "timeUnits")
        return [{ id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 }];
      if (key === "scanWorldActors") return false;
      return [];
    }),
  },
}));

vi.mock("@/logic/actor-config-logic.js", () => ({
  ActorConfigLogic: { saveConfig: vi.fn().mockResolvedValue(true) },
}));

function makeTeacher(id: string, name: string, offeringsCount = 1) {
  const offerings = Array.from({ length: offeringsCount }, (_, i) => ({
    name: `Lesson ${i + 1}`,
    modifier: 2,
    costs: { hour: 50 },
    categories: [],
  }));
  return {
    id,
    name,
    getFlag: vi.fn().mockImplementation((_scope: string, key: string) => {
      if (key === "teacherOfferings") return offerings;
      if (key === "learningModeEnabled") return true;
      return null;
    }),
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

describe("TeachersTab.svelte", () => {
  let instance: any;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.mocked(logic.loadTeachersIndex).mockResolvedValue([]);
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([]);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    container.remove();
  });

  it("shows loading state while data is fetched", () => {
    vi.mocked(logic.loadTeachersIndex).mockReturnValue(new Promise(() => {}) as any);

    instance = mount(TeachersTab, { target: container });

    expect(container.innerHTML).toContain("Loading teachers");
  });

  it("shows empty state when no configured teachers exist", async () => {
    instance = mount(TeachersTab, { target: container });
    await waitForLoaded(container);

    expect(container.innerHTML).toContain("No configured teachers found");
  });

  it("renders a card for each configured teacher", async () => {
    const teachers = [makeTeacher("t1", "Gandalf"), makeTeacher("t2", "Merlin")];
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue(teachers as any);

    instance = mount(TeachersTab, { target: container });
    await waitForLoaded(container);

    expect(container.querySelectorAll(".entity-card")).toHaveLength(2);
    expect(container.innerHTML).toContain("Gandalf");
    expect(container.innerHTML).toContain("Merlin");
  });

  it("displays the offering count badge on each teacher card", async () => {
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([
      makeTeacher("t1", "Gandalf", 3),
    ] as any);

    instance = mount(TeachersTab, { target: container });
    await waitForLoaded(container);

    const badge = container.querySelector(".badge");
    expect(badge?.textContent).toContain("3");
  });

  it("expands and collapses a teacher card on header click", async () => {
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([
      makeTeacher("t1", "Gandalf"),
    ] as any);

    instance = mount(TeachersTab, { target: container });
    await waitForLoaded(container);

    expect(container.querySelector(".entity-card.expanded")).toBeNull();

    const header = container.querySelector(".card-header") as HTMLButtonElement;
    header.click();
    await tick();
    expect(container.querySelector(".entity-card.expanded")).not.toBeNull();

    header.click();
    await tick();
    expect(container.querySelector(".entity-card.expanded")).toBeNull();
  });

  it("only one teacher card is expanded at a time", async () => {
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([
      makeTeacher("t1", "Gandalf"),
      makeTeacher("t2", "Merlin"),
    ] as any);

    instance = mount(TeachersTab, { target: container });
    await waitForLoaded(container);

    const headers = container.querySelectorAll(".card-header") as NodeListOf<HTMLButtonElement>;
    headers[0].click();
    await tick();
    headers[1].click();
    await tick();

    const expanded = container.querySelectorAll(".entity-card.expanded");
    expect(expanded).toHaveLength(1);
    expect(expanded[0].textContent).toContain("Merlin");
  });

  it("shows the Add dialog when the Add button is clicked", async () => {
    instance = mount(TeachersTab, { target: container });
    await waitForLoaded(container);

    expect(container.querySelector(".add-entity-dialog")).toBeNull();

    const addBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add / Create Teacher"),
    ) as HTMLButtonElement;
    addBtn.click();
    await tick();

    expect(container.querySelector(".add-entity-dialog")).not.toBeNull();
  });

  it("adds newly activated teacher to the list and auto-expands it", async () => {
    vi.mocked(logic.loadTeachersIndex).mockResolvedValue([
      {
        _id: "t1",
        name: "Gandalf",
        packId: "world.teachers",
        uuid: "Compendium.world.teachers.Actor.t1",
        learningModeEnabled: true,
      },
      {
        _id: "t99",
        name: "Merlin",
        packId: "world.teachers",
        uuid: "Compendium.world.teachers.Actor.t99",
        learningModeEnabled: false,
      },
    ]);
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([
      makeTeacher("t1", "Gandalf"),
    ] as any);

    instance = mount(TeachersTab, { target: container });
    await waitForLoaded(container);

    expect(container.querySelectorAll(".entity-card")).toHaveLength(1);

    const newTeacher = makeTeacher("t2", "Merlin");
    vi.mocked(logic.activateDocument).mockResolvedValue(newTeacher as any);

    const addBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add / Create Teacher"),
    ) as HTMLButtonElement;
    addBtn.click();
    await tick();

    const resultRow = container.querySelector(".result-row") as HTMLButtonElement;
    expect(resultRow).not.toBeNull();
    resultRow.click();
    await vi.waitFor(() => {
      expect(container.querySelectorAll(".entity-card")).toHaveLength(2);
    });
    expect(container.innerHTML).toContain("Merlin");
  });
});
