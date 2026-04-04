import { describe, it, expect, vi, beforeEach } from "vitest";
import CompendiumConfig from "../src/apps/components/CompendiumConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("CompendiumConfig.svelte", () => {
  const mockPacks = [
    { id: "pack1", label: "Pack 1" },
    { id: "pack2", label: "Pack 2" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should mount and show packs", async () => {
    const target = document.createElement("div");
    const instance = mount(CompendiumConfig, {
      target,
      props: { allowedCompendiums: ["pack1"], availablePacks: mockPacks },
    });
    await tick();

    expect(target.innerHTML).toContain("Pack 1");
    expect(target.innerHTML).toContain("Pack 2");
    const checkbox = target.querySelector("input[type='checkbox']") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    unmount(instance);
  });

  it("should show empty state", async () => {
    const target = document.createElement("div");
    const instance = mount(CompendiumConfig, {
      target,
      props: { allowedCompendiums: [], availablePacks: [] },
    });
    await tick();

    expect(target.innerHTML).toContain("No compendiums available");
    unmount(instance);
  });
});
