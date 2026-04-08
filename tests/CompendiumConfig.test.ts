import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import CompendiumConfig from "../src/apps/components/CompendiumConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("CompendiumConfig.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  const mockPacks = [
    { id: "pack1", label: "Pack 1" },
    { id: "pack2", label: "Pack 2" },
  ];

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

  it("should mount and show packs", async () => {
    instance = mount(CompendiumConfig, {
      target,
      props: { allowedCompendiums: ["pack1"], availablePacks: mockPacks },
    });
    await tick();

    expect(target.innerHTML).toContain("Pack 1");
    expect(target.innerHTML).toContain("Pack 2");
    const checkbox = target.querySelector("input[data-pack-id='pack1']") as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(true);
  });

  it("should show empty state", async () => {
    instance = mount(CompendiumConfig, {
      target,
      props: { allowedCompendiums: [], availablePacks: [] },
    });
    await tick();

    expect(target.innerHTML).toContain("No compendiums available");
  });

  it("should toggle a compendium", async () => {
    let allowedCompendiums = ["pack1"];
    instance = mount(CompendiumConfig, {
      target,
      props: {
        get allowedCompendiums() {
          return allowedCompendiums;
        },
        set allowedCompendiums(v) {
          allowedCompendiums = v;
        },
        availablePacks: mockPacks,
      },
    });
    await tick();

    const pack2Checkbox = target.querySelector("input[data-pack-id='pack2']") as HTMLInputElement;
    expect(pack2Checkbox).not.toBeNull();

    // Simulate click/change
    pack2Checkbox.click();
    await tick();

    expect(allowedCompendiums).toContain("pack2");
    expect(allowedCompendiums).toContain("pack1");
    expect(pack2Checkbox.checked).toBe(true);

    // Toggle off
    pack2Checkbox.click();
    await tick();
    expect(allowedCompendiums).not.toContain("pack2");
    expect(pack2Checkbox.checked).toBe(false);
  });
});
