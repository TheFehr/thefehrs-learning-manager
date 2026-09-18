import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import CompendiumConfig from "@/apps/components/CompendiumConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("CompendiumConfig.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  const mockPacks = [
    { id: "pack1", label: "Pack 1", isFitting: true },
    { id: "pack2", label: "Pack 2", isFitting: true },
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

    expect(target.innerHTML).toContain("No compendiums available.");
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

  const mixedPacks = [
    { id: "pack1", label: "Fitting Pack", isFitting: true },
    { id: "pack2", label: "Other Pack", isFitting: false },
    { id: "pack3", label: "Another Fitting", isFitting: true },
  ];

  it("should filter packs by label or id", async () => {
    instance = mount(CompendiumConfig, {
      target,
      props: { allowedCompendiums: [], availablePacks: mixedPacks },
    });
    await tick();

    const filterInput = target.querySelector(
      "input[aria-label='Filter compendiums']",
    ) as HTMLInputElement;
    expect(filterInput).not.toBeNull();

    filterInput.value = "pack2";
    filterInput.dispatchEvent(new Event("input"));
    await tick();

    expect(target.innerHTML).toContain("Other Pack");
    expect(target.innerHTML).not.toContain("Fitting Pack");
    expect(target.innerHTML).not.toContain("Another Fitting");

    filterInput.value = "pack3";
    filterInput.dispatchEvent(new Event("input"));
    await tick();

    expect(target.innerHTML).toContain("Another Fitting");
    expect(target.innerHTML).not.toContain("Other Pack");
  });

  it("should show a filter-specific empty state when nothing matches", async () => {
    instance = mount(CompendiumConfig, {
      target,
      props: { allowedCompendiums: [], availablePacks: mixedPacks },
    });
    await tick();

    const filterInput = target.querySelector(
      "input[aria-label='Filter compendiums']",
    ) as HTMLInputElement;
    filterInput.value = "nonexistent";
    filterInput.dispatchEvent(new Event("input"));
    await tick();

    expect(target.innerHTML).toContain("No compendiums match your filter.");
  });

  it("should select all fitting packs without deselecting existing choices", async () => {
    let allowedCompendiums: string[] = ["pack2"];
    instance = mount(CompendiumConfig, {
      target,
      props: {
        get allowedCompendiums() {
          return allowedCompendiums;
        },
        set allowedCompendiums(v) {
          allowedCompendiums = v;
        },
        availablePacks: mixedPacks,
      },
    });
    await tick();

    const selectFittingBtn = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Select Fitting"),
    ) as HTMLButtonElement;
    expect(selectFittingBtn).not.toBeNull();
    expect(selectFittingBtn.textContent).toContain("(2)");

    selectFittingBtn.click();
    await tick();

    expect(allowedCompendiums).toContain("pack1");
    expect(allowedCompendiums).toContain("pack2");
    expect(allowedCompendiums).toContain("pack3");
    expect(allowedCompendiums).toHaveLength(3);
  });

  it("should clear the selection", async () => {
    let allowedCompendiums: string[] = ["pack1", "pack2"];
    instance = mount(CompendiumConfig, {
      target,
      props: {
        get allowedCompendiums() {
          return allowedCompendiums;
        },
        set allowedCompendiums(v) {
          allowedCompendiums = v;
        },
        availablePacks: mixedPacks,
      },
    });
    await tick();

    const clearBtn = Array.from(target.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Clear",
    ) as HTMLButtonElement;
    expect(clearBtn).not.toBeNull();
    expect(clearBtn.disabled).toBe(false);

    clearBtn.click();
    await tick();

    expect(allowedCompendiums).toHaveLength(0);
  });

  it("should disable bulk-action buttons when there is nothing to act on", async () => {
    instance = mount(CompendiumConfig, {
      target,
      props: { allowedCompendiums: [], availablePacks: [] },
    });
    await tick();

    const selectFittingBtn = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Select Fitting"),
    ) as HTMLButtonElement;
    const clearBtn = Array.from(target.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Clear",
    ) as HTMLButtonElement;

    expect(selectFittingBtn.disabled).toBe(true);
    expect(clearBtn.disabled).toBe(true);
  });
});
