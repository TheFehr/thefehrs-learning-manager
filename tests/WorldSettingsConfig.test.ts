import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import WorldSettingsConfig from "../src/apps/components/WorldSettingsConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("WorldSettingsConfig.svelte", () => {
  let instance: any;
  let target: HTMLElement;

  const mockProps = {
    rules: { nonBulkMethod: "roll", bulkMethod: "mathematical" },
    timeUnits: [],
    guidanceTiers: [],
    allowedCompendiums: [],
    availablePacks: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) {
      unmount(instance);
    }
    instance = undefined;
    target.remove();
  });

  it("should mount and show sections", async () => {
    instance = mount(WorldSettingsConfig, {
      target,
      props: mockProps as any,
    });
    await tick();

    expect(target.innerHTML).toContain("Global Rules");
    expect(target.innerHTML).toContain("Time Units");
    expect(target.innerHTML).toContain("Guidance Tiers");
  });
});
