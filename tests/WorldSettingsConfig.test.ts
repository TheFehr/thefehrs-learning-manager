import { describe, it, expect, vi, beforeEach } from "vitest";
import WorldSettingsConfig from "../src/apps/components/WorldSettingsConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("WorldSettingsConfig.svelte", () => {
  const mockProps = {
    rules: { nonBulkMethod: "roll", bulkMethod: "mathematical" },
    timeUnits: [],
    guidanceTiers: [],
    allowedCompendiums: [],
    availablePacks: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should mount and show sections", async () => {
    const target = document.createElement("div");
    const instance = mount(WorldSettingsConfig, {
      target,
      props: mockProps as any,
    });
    await tick();

    expect(target.innerHTML).toContain("Global Rules");
    expect(target.innerHTML).toContain("Time Units");
    expect(target.innerHTML).toContain("Guidance Tiers");
    unmount(instance);
  });
});
