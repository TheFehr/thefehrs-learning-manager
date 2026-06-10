import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import BooksTab from "@/apps/mass-edit/BooksTab.svelte";
import { mount, unmount, tick } from "svelte";
import * as logic from "@/apps/mass-edit/mass-edit-logic.js";

vi.unmock("svelte");

vi.mock("@/apps/mass-edit/mass-edit-logic.js", () => ({
  loadBooksIndex: vi.fn(),
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
      if (key === "bookCompendiums") return ["world.books"];
      if (key === "allowedCompendiums") return [];
      if (key === "categories") return [];
      return [];
    }),
  },
}));

vi.mock("@/logic/item-config-logic.js", () => ({
  ItemConfigLogic: { saveConfig: vi.fn().mockResolvedValue(true) },
}));

function makeBook(id: string, name: string, modifier = 2, categoryCount = 1) {
  const categories = Array.from({ length: categoryCount }, (_, i) => `cat-${i}`);
  return {
    id,
    name,
    uuid: `Compendium.world.books.Item.${id}`,
    type: "loot",
    system: { type: {}, description: { value: "" }, activities: [] },
    getFlag: vi.fn().mockImplementation((_scope: string, key: string) => {
      if (key === "learningBookBonus") return { modifier, categories };
      if (key === "learningModeEnabled") return true;
      if (key === "isLearningProject") return false;
      if (key === "isLearnedReward") return false;
      if (key === "projectData") return null;
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

describe("BooksTab.svelte", () => {
  let instance: any;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.mocked(logic.loadBooksIndex).mockResolvedValue([]);
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([]);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    container.remove();
  });

  it("shows loading state while data is fetched", () => {
    vi.mocked(logic.loadBooksIndex).mockReturnValue(new Promise(() => {}) as any);

    instance = mount(BooksTab, { target: container });

    expect(container.innerHTML).toContain("Loading books");
  });

  it("shows empty state when no configured books exist", async () => {
    instance = mount(BooksTab, { target: container });
    await waitForLoaded(container);

    expect(container.innerHTML).toContain("No configured books found");
  });

  it("renders a card for each configured book", async () => {
    const books = [makeBook("b1", "Tome of Magic"), makeBook("b2", "Sword Manual")];
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue(books as any);

    instance = mount(BooksTab, { target: container });
    await waitForLoaded(container);

    expect(container.querySelectorAll(".entity-card")).toHaveLength(2);
    expect(container.innerHTML).toContain("Tome of Magic");
    expect(container.innerHTML).toContain("Sword Manual");
  });

  it("shows modifier badge when book has non-zero modifier", async () => {
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([makeBook("b1", "Tome", 3)] as any);

    instance = mount(BooksTab, { target: container });
    await waitForLoaded(container);

    const badge = container.querySelector(".badge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("+3");
  });

  it("shows category count badge when book has categories", async () => {
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([
      makeBook("b1", "Tome", 2, 3),
    ] as any);

    instance = mount(BooksTab, { target: container });
    await waitForLoaded(container);

    const badges = container.querySelectorAll(".badge");
    expect(badges.length).toBeGreaterThanOrEqual(2);
    const categoriesBadge = Array.from(badges).find((b) => b.textContent?.includes("3"));
    expect(categoriesBadge).not.toBeNull();
  });

  it("expands and collapses a book card on header click", async () => {
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([makeBook("b1", "Tome")] as any);

    instance = mount(BooksTab, { target: container });
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

  it("only one book card is expanded at a time", async () => {
    vi.mocked(logic.loadConfiguredDocuments).mockResolvedValue([
      makeBook("b1", "Tome of Magic"),
      makeBook("b2", "Sword Manual"),
    ] as any);

    instance = mount(BooksTab, { target: container });
    await waitForLoaded(container);

    const headers = container.querySelectorAll(".card-header") as NodeListOf<HTMLButtonElement>;
    headers[0].click();
    await tick();
    headers[1].click();
    await tick();

    const expanded = container.querySelectorAll(".entity-card.expanded");
    expect(expanded).toHaveLength(1);
    expect(expanded[0].textContent).toContain("Sword Manual");
  });

  it("shows the Add dialog when the Add button is clicked", async () => {
    instance = mount(BooksTab, { target: container });
    await waitForLoaded(container);

    expect(container.querySelector(".add-entity-dialog")).toBeNull();

    const addBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add / Create Book"),
    ) as HTMLButtonElement;
    addBtn.click();
    await tick();

    expect(container.querySelector(".add-entity-dialog")).not.toBeNull();
  });

  it("dismisses the Add dialog and does not persist it", async () => {
    instance = mount(BooksTab, { target: container });
    await waitForLoaded(container);

    const addBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add / Create Book"),
    ) as HTMLButtonElement;
    addBtn.click();
    await tick();

    const dismissBtn = container.querySelector(".dismiss-btn") as HTMLButtonElement;
    dismissBtn.click();
    await tick();

    expect(container.querySelector(".add-entity-dialog")).toBeNull();
  });

  it("clicking Add again after dismiss re-opens the dialog", async () => {
    instance = mount(BooksTab, { target: container });
    await waitForLoaded(container);

    const addBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add / Create Book"),
    ) as HTMLButtonElement;

    addBtn.click();
    await tick();
    const dismissBtn = container.querySelector(".dismiss-btn") as HTMLButtonElement;
    dismissBtn.click();
    await tick();

    addBtn.click();
    await tick();
    expect(container.querySelector(".add-entity-dialog")).not.toBeNull();
  });
});
