import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AbortProjectDialog from "@/apps/dialogs/AbortProjectDialog.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("AbortProjectDialog.svelte", () => {
  let instance: ReturnType<typeof mount> | undefined;
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

  it("should mount and show projectName and actorName", async () => {
    instance = mount(AbortProjectDialog, {
      target: target!,
      props: { projectName: "Test Project", actorName: "Test Actor" },
    });
    await tick();

    const text = target!.textContent || "";
    expect(text).toContain("Test Project");
    expect(text).toContain("Test Actor");
  });
});
