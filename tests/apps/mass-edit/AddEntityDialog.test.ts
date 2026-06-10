import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AddEntityDialog from "@/apps/mass-edit/AddEntityDialog.svelte";
import { mount, unmount, tick } from "svelte";
import * as logic from "@/apps/mass-edit/mass-edit-logic.js";

vi.unmock("svelte");

vi.mock("@/apps/mass-edit/mass-edit-logic.js", () => ({
  activateDocument: vi.fn(),
  createAndActivateDocument: vi.fn(),
  getAvailableDestinations: vi.fn().mockReturnValue([
    { id: "world.pack", label: "My Compendium" },
    { id: "", label: "World" },
  ]),
  loadProjectsIndex: vi.fn().mockResolvedValue([]),
  loadTeachersIndex: vi.fn().mockResolvedValue([]),
  loadBooksIndex: vi.fn().mockResolvedValue([]),
  loadConfiguredDocuments: vi.fn().mockResolvedValue([]),
  buildPackIndex: vi.fn().mockResolvedValue([]),
  buildWorldActorIndex: vi.fn().mockReturnValue([]),
}));

const makeEntry = (id: string, name: string, enabled: boolean) => ({
  _id: id,
  name,
  packId: "world.pack",
  uuid: `Compendium.world.pack.Item.${id}`,
  learningModeEnabled: enabled,
});

describe("AddEntityDialog.svelte", () => {
  let instance: any;
  let target: HTMLElement;
  const onAdded = vi.fn();
  const onDismiss = vi.fn();

  const allEntries = [
    makeEntry("cfg", "Configured Item", true),
    makeEntry("uncfg-1", "Unconfigured Alpha", false),
    makeEntry("uncfg-2", "Unconfigured Beta", false),
  ];

  function mountDialog(entries = allEntries) {
    instance = mount(AddEntityDialog, {
      target,
      props: {
        packIds: ["world.pack"],
        docType: "Item",
        defaultItemType: "feat",
        allEntries: entries,
        onAdded,
        onDismiss,
      } as any,
    });
  }

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

  // --- Search mode (default) ---

  it("renders in search mode by default", async () => {
    mountDialog();
    await tick();

    expect(target.querySelector(".search-mode")).not.toBeNull();
    expect(target.querySelector(".create-mode")).toBeNull();
  });

  it("lists only unconfigured entries in search results", async () => {
    mountDialog();
    await tick();

    const rows = target.querySelectorAll(".result-row");
    expect(rows).toHaveLength(2);
    const names = Array.from(rows).map((r) => r.textContent);
    expect(names.some((n) => n?.includes("Unconfigured Alpha"))).toBe(true);
    expect(names.some((n) => n?.includes("Unconfigured Beta"))).toBe(true);
    expect(names.some((n) => n?.includes("Configured Item"))).toBe(false);
  });

  it("filters results by search query", async () => {
    mountDialog();
    await tick();

    const input = target.querySelector("input[type='text']") as HTMLInputElement;
    input.value = "Alpha";
    input.dispatchEvent(new Event("input"));
    await tick();

    const rows = target.querySelectorAll(".result-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Alpha");
  });

  it("shows 'no matches' message when search yields nothing", async () => {
    mountDialog();
    await tick();

    const input = target.querySelector("input[type='text']") as HTMLInputElement;
    input.value = "xyz-no-match";
    input.dispatchEvent(new Event("input"));
    await tick();

    expect(target.innerHTML).toContain("No matches found");
  });

  it("shows 'all configured' message when allEntries has no unconfigured docs", async () => {
    mountDialog([makeEntry("cfg", "All Configured", true)]);
    await tick();

    expect(target.innerHTML).toContain("All entries are already configured");
  });

  it("calls activateDocument and onAdded when a result row is clicked", async () => {
    const fakeDoc = { id: "uncfg-1", name: "Unconfigured Alpha" };
    vi.mocked(logic.activateDocument).mockResolvedValue(fakeDoc as any);

    mountDialog();
    await tick();

    const firstRow = target.querySelector(".result-row") as HTMLButtonElement;
    firstRow.click();
    await tick();
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledWith(fakeDoc));
  });

  it("shows an error if activateDocument returns null", async () => {
    vi.mocked(logic.activateDocument).mockResolvedValue(null);

    mountDialog();
    await tick();

    const firstRow = target.querySelector(".result-row") as HTMLButtonElement;
    firstRow.click();
    await tick();

    await vi.waitFor(() => expect(target.querySelector(".error-message")).not.toBeNull());
  });

  // --- Create mode ---

  it("switches to create mode when the Create tab is clicked", async () => {
    mountDialog();
    await tick();

    const createBtn = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Create New"),
    ) as HTMLButtonElement;
    createBtn.click();
    await tick();

    expect(target.querySelector(".create-mode")).not.toBeNull();
    expect(target.querySelector(".search-mode")).toBeNull();
  });

  it("shows destination picker with available destinations in create mode", async () => {
    mountDialog();
    await tick();

    const createBtn = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Create New"),
    ) as HTMLButtonElement;
    createBtn.click();
    await tick();

    const select = target.querySelector("select#new-destination") as HTMLSelectElement;
    expect(select).not.toBeNull();
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain("My Compendium");
    expect(options).toContain("World");
  });

  it("create button is disabled when name is empty", async () => {
    mountDialog();
    await tick();

    const createModeBtn = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Create New"),
    ) as HTMLButtonElement;
    createModeBtn.click();
    await tick();

    const createBtn = Array.from(target.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Create") && !b.textContent?.includes("New"),
    ) as HTMLButtonElement;
    expect(createBtn?.disabled).toBe(true);
  });

  it("calls createAndActivateDocument and onAdded with a valid name", async () => {
    const fakeDoc = { id: "new-1", name: "Brand New" };
    vi.mocked(logic.createAndActivateDocument).mockResolvedValue(fakeDoc as any);

    mountDialog();
    await tick();

    const createModeBtn = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Create New"),
    ) as HTMLButtonElement;
    createModeBtn.click();
    await tick();

    const nameInput = target.querySelector("input#new-name") as HTMLInputElement;
    nameInput.value = "Brand New";
    nameInput.dispatchEvent(new Event("input"));
    await tick();

    const createBtn = Array.from(target.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Create") && !b.textContent?.includes("New") && !b.disabled,
    ) as HTMLButtonElement;
    createBtn.click();
    await tick();

    await vi.waitFor(() =>
      expect(logic.createAndActivateDocument).toHaveBeenCalledWith(
        "Item",
        "Brand New",
        "feat",
        expect.any(String),
      ),
    );
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalledWith(fakeDoc));
  });

  // --- Dismiss ---

  it("calls onDismiss when the dismiss button is clicked", async () => {
    mountDialog();
    await tick();

    const dismissBtn = target.querySelector(".dismiss-btn") as HTMLButtonElement;
    dismissBtn.click();
    await tick();

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
