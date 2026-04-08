import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import GuidanceConfig from "../src/apps/components/GuidanceConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("GuidanceConfig.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  const mockProps = {
    guidanceTiers: [
      { id: "tier1", name: "Tier 1", modifier: 2, costs: { hour: 100 }, progress: { hour: 1 } },
    ],
    timeUnits: [{ id: "hour", name: "Hour", isBulk: false }],
    rules: { bulkMethod: "direct" },
  };

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

  it("should mount and show tiers", async () => {
    instance = mount(GuidanceConfig, {
      target,
      props: mockProps as any,
    });
    await tick();

    const nameInput = target.querySelector(".tier-name-input") as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    expect(nameInput.value).toBe("Tier 1");
    expect(target.innerHTML).toContain("Costs (cp)");
  });
});
