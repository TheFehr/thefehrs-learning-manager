import { describe, it, expect, vi, beforeEach } from "vitest";
import GuidanceConfig from "../src/apps/components/GuidanceConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("GuidanceConfig.svelte", () => {
  const mockProps = {
    guidanceTiers: [
      { id: "tier1", name: "Tier 1", modifier: 2, costs: { hour: 100 }, progress: { hour: 1 } },
    ],
    timeUnits: [{ id: "hour", name: "Hour", isBulk: false }],
    rules: { bulkMethod: "direct" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should mount and show tiers", async () => {
    const target = document.createElement("div");
    const instance = mount(GuidanceConfig, {
      target,
      props: mockProps as any,
    });
    await tick();

    const nameInput = target.querySelector(".tier-name-input") as HTMLInputElement;
    expect(nameInput.value).toBe("Tier 1");
    expect(target.innerHTML).toContain("Costs (cp)");
    unmount(instance);
  });
});
