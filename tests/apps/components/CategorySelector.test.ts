import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import CategorySelector from "../../../src/apps/components/CategorySelector.svelte";
import CategorySelectorWrapper from "./CategorySelectorWrapper.svelte";
import { mount, unmount, tick } from "svelte";
import { Settings } from "../../../src/core/settings";

vi.unmock("svelte");

vi.mock("../../../src/core/settings", () => ({
  Settings: {
    get: vi.fn(),
  },
}));

vi.mock("../../../src/logic/settings-logic", () => ({
  ensureCategoryExists: vi.fn().mockResolvedValue(true),
}));

describe("CategorySelector.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Settings.get).mockImplementation((key) => {
      if (key === "categories") return ["skill:arc", "skill:ath"];
      return [];
    });
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
  });

  it("should mount and show existing categories", async () => {
    instance = mount(CategorySelector, {
      target,
      props: { categories: ["cat1", "cat2"] },
    });

    await tick();

    const inputs = target.querySelectorAll('input[type="text"]') as NodeListOf<HTMLInputElement>;
    expect(inputs.length).toBe(2);
    expect(inputs[0].value).toBe("cat1");
    expect(inputs[1].value).toBe("cat2");

    expect(target.querySelector("datalist")?.children.length).toBe(2);
  });

  it("should call onValueChange when input changes", async () => {
    const categories = [""];
    instance = mount(CategorySelector, {
      target,
      props: { categories } as any,
    });

    await tick();

    const input = target.querySelector("input") as HTMLInputElement;
    input.value = "new-cat";
    input.dispatchEvent(new Event("change"));

    await tick();
  });

  it("should handle adding and removing categories using wrapper", async () => {
    instance = mount(CategorySelectorWrapper, {
      target,
    });

    await tick();

    const count = target.querySelector("#count") as HTMLElement;
    expect(count.textContent).toBe("1");

    const addButton = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add Category"),
    ) as HTMLButtonElement;
    addButton!.click();
    await tick();

    expect(count.textContent).toBe("2");

    const removeButton = target.querySelector("button.danger") as HTMLButtonElement;
    removeButton.click();
    await tick();

    expect(count.textContent).toBe("1");
  });
});
