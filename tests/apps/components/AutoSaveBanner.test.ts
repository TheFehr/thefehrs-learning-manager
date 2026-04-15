import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AutoSaveBanner from "@/apps/components/AutoSaveBanner.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("AutoSaveBanner.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    target.remove();
  });

  it("should show 'Saving...' when isSaving is true", async () => {
    instance = mount(AutoSaveBanner, {
      target,
      props: { isSaving: true, saveError: null },
    });
    await tick();

    const indicator = target.querySelector(".saving-indicator");
    expect(indicator?.textContent).toContain("Saving...");
  });

  it("should show error message when saveError is provided", async () => {
    instance = mount(AutoSaveBanner, {
      target,
      props: { isSaving: false, saveError: "Network error" },
    });
    await tick();

    const indicator = target.querySelector(".error-indicator");
    expect(indicator?.textContent).toContain("Network error");
  });

  it("should show 'All changes saved' when idle", async () => {
    instance = mount(AutoSaveBanner, {
      target,
      props: { isSaving: false, saveError: null },
    });
    await tick();

    const indicator = target.querySelector(".saved-indicator");
    expect(indicator?.textContent).toContain("All changes saved");
  });
});
