import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TimeUnitsConfig from "../../../src/apps/components/TimeUnitsConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("TimeUnitsConfig.svelte", () => {
  const mockTimeUnits = [{ id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 }];
  let target: HTMLElement;
  let instance: ReturnType<typeof mount>;

  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).foundry = (global as any).foundry || {};
    (global as any).foundry.utils = (global as any).foundry.utils || {};
    (global as any).foundry.utils.randomID = vi.fn().mockReturnValue("rand123");
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
    delete (global as any).foundry;
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
});
