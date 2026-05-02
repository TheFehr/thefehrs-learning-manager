import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ItemLearningConfig from "@/apps/tabs/ItemLearningConfig.svelte";
import { mount, unmount, tick } from "svelte";
import { toggleUserGM } from "../../setup";

vi.unmock("svelte");

describe("ItemLearningConfig.svelte", () => {
  let instance: any;
  let target: HTMLElement;

  const mockItem = {
    id: "item1",
    name: "Mock Item",
    uuid: "Compendium.world.pack.Item.1",
    getFlag: vi.fn().mockImplementation((scope, key) => {
      if (key === "projectData")
        return { progress: 0, target: 10, followUpProjectId: "", requirements: [] };
      return null;
    }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    toggleUserGM(true);
    target = document.createElement("div");
    document.body.appendChild(target);
    (globalThis as any).game.settings.get = vi.fn().mockImplementation((_scope, key) => {
      if (key === "allowedCompendiums") return ["world.pack"];
      if (key === "bookCompendiums") return [];
      if (key === "categories") return [];
      return null;
    });
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
  });

  it("should mount and show target input", async () => {
    instance = mount(ItemLearningConfig, {
      target,
      props: { item: mockItem },
    });
    await tick();

    expect(target.innerHTML).toContain("Target Progress");
    expect(target.querySelector("input[id='target-progress']")).not.toBeNull();
  });

  it("should handle adding and removing requirements", async () => {
    instance = mount(ItemLearningConfig, {
      target,
      props: { item: mockItem },
    });
    await tick();

    const addButton = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add Requirement"),
    );
    expect(addButton).not.toBeUndefined();
    expect(addButton).not.toBeNull();

    addButton?.click();
    await tick();

    expect(target.querySelectorAll(".requirement-row").length).toBe(1);

    const removeButton = target.querySelector(
      ".requirement-row button.danger",
    ) as HTMLButtonElement;
    expect(removeButton).not.toBeNull();
    removeButton?.click();
    await tick();

    expect(target.querySelectorAll(".requirement-row").length).toBe(0);
  });

  it("should show book configuration if item is in a book compendium", async () => {
    (globalThis as any).game.settings.get = vi.fn().mockImplementation((_scope, key) => {
      if (key === "allowedCompendiums") return [];
      if (key === "bookCompendiums") return ["world.pack"];
      return [];
    });

    const bookItem = {
      ...mockItem,
      getFlag: vi.fn().mockImplementation((_scope, key) => {
        if (key === "learningModeEnabled") return true;
        return null;
      }),
    };

    instance = mount(ItemLearningConfig, {
      target,
      props: { item: bookItem },
    });
    await tick();

    expect(target.innerHTML).toContain("Learning Book Configuration");
    expect(target.querySelector("#book-modifier")).not.toBeNull();
  });

  it("should show both configurations if item is not in any restricted compendium", async () => {
    (globalThis as any).game.settings.get = vi.fn().mockImplementation((_scope, key) => {
      if (key === "allowedCompendiums") return ["other.pack"];
      if (key === "bookCompendiums") return ["another.pack"];
      return [];
    });

    const neutralItem = {
      ...mockItem,
      getFlag: vi.fn().mockImplementation((_scope, key) => {
        if (key === "learningModeEnabled") return true;
        return null;
      }),
    };

    instance = mount(ItemLearningConfig, {
      target,
      props: { item: neutralItem },
    });
    await tick();

    expect(target.innerHTML).toContain("Project Configuration");
    expect(target.innerHTML).toContain("Learning Book Configuration");
  });
});
