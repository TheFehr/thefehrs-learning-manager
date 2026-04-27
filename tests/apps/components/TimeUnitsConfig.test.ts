import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TimeUnitsConfig from "@/apps/components/TimeUnitsConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("TimeUnitsConfig.svelte", () => {
  const mockTimeUnits = [{ id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 }];
  let target: HTMLElement;
  let instance: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).foundry = (globalThis as any).foundry || {};
    (globalThis as any).foundry.utils = (globalThis as any).foundry.utils || {};
    (globalThis as any).foundry.utils.randomID = vi.fn().mockReturnValue("rand123");
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
    delete (globalThis as any).foundry;
  });

  it("should mount and show units", async () => {
    instance = mount(TimeUnitsConfig, {
      target,
      props: { timeUnits: [...mockTimeUnits] },
    });
    await tick();

    const nameInput = target.querySelector("input[aria-label='Unit Name']") as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    expect(nameInput.value).toBe("Hour");
  });

  it("should add a unit when clicking the add button", async () => {
    const units = [...mockTimeUnits];
    instance = mount(TimeUnitsConfig, {
      target,
      props: { timeUnits: units },
    });
    await tick();

    const addBtn = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add Unit"),
    );
    expect(addBtn).toBeDefined();
    addBtn!.click();
    await tick();

    expect(target.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("should remove a unit when clicking the remove button", async () => {
    const units = [
      { id: "u1", name: "Unit 1", short: "u1", isBulk: false, ratio: 1 },
      { id: "u2", name: "Unit 2", short: "u2", isBulk: false, ratio: 1 },
    ];
    instance = mount(TimeUnitsConfig, {
      target,
      props: { timeUnits: units },
    });
    await tick();

    const removeBtn = target.querySelector("button[title='Delete Time Unit']") as HTMLButtonElement;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();
    await tick();

    expect(target.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("should handle mounting with empty units", async () => {
    const units: any[] = [];
    instance = mount(TimeUnitsConfig, {
      target,
      props: { timeUnits: units },
    });
    await tick();

    expect(target.querySelectorAll("tbody tr")).toHaveLength(0);

    const addBtn = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add Unit"),
    );
    addBtn!.click();
    await tick();

    expect(target.querySelectorAll("tbody tr")).toHaveLength(1);
  });
});
