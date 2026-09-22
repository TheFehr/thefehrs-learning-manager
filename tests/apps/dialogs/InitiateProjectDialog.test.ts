import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import InitiateProjectDialog from "@/apps/dialogs/InitiateProjectDialog.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("InitiateProjectDialog.svelte", () => {
  let instance: any;
  let target: HTMLDivElement | null;

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
    if (target) {
      target.remove();
      target = null;
    }
  });

  it("should mount and show itemName and actorName", async () => {
    instance = mount(InitiateProjectDialog, {
      target: target!,
      props: { itemName: "Test Feat", actorName: "Test Actor", target: 10 },
    });
    await tick();

    const text = target!.textContent || "";
    expect(text).toContain("Test Feat");
    expect(text).toContain("Test Actor");
  });

  it("defaults to 0 starting progress, not marked complete", async () => {
    instance = mount(InitiateProjectDialog, {
      target: target!,
      props: { itemName: "Test Feat", actorName: "Test Actor", target: 10 },
    });
    await tick();

    expect(instance.getValues()).toEqual({ progress: 0, markComplete: false });
  });

  it("reflects a typed starting progress, clamped to target", async () => {
    instance = mount(InitiateProjectDialog, {
      target: target!,
      props: { itemName: "Test Feat", actorName: "Test Actor", target: 10 },
    });
    await tick();

    const progressInput = target!.querySelector(".initiate-progress-input") as HTMLInputElement;
    progressInput.value = "7";
    progressInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();

    expect(instance.getValues()).toEqual({ progress: 7, markComplete: false });

    progressInput.value = "999";
    progressInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();

    expect(instance.getValues()).toEqual({ progress: 10, markComplete: false });
  });

  it("forces progress to target when marked complete, regardless of the number field", async () => {
    instance = mount(InitiateProjectDialog, {
      target: target!,
      props: { itemName: "Test Feat", actorName: "Test Actor", target: 10 },
    });
    await tick();

    const progressInput = target!.querySelector(".initiate-progress-input") as HTMLInputElement;
    progressInput.value = "3";
    progressInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();

    const completeCheckbox = target!.querySelector(".initiate-mark-complete") as HTMLInputElement;
    completeCheckbox.click();
    await tick();

    expect(instance.getValues()).toEqual({ progress: 10, markComplete: true });
    expect(progressInput.disabled).toBe(true);
  });
});
