import { describe, it, expect, vi, beforeEach } from "vitest";
import TimeUnitsConfig from "../src/apps/components/TimeUnitsConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("TimeUnitsConfig.svelte", () => {
  const mockTimeUnits = [{ id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 }];

  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).foundry = { utils: { randomID: vi.fn().mockReturnValue("rand123") } };
  });

  it("should mount and show units", async () => {
    const target = document.createElement("div");
    const instance = mount(TimeUnitsConfig, {
      target,
      props: { timeUnits: [...mockTimeUnits] as any },
    });
    await tick();

    const nameInput = target.querySelector("input[aria-label='Unit Name']") as HTMLInputElement;
    expect(nameInput.value).toBe("Hour");
    unmount(instance);
  });
});
