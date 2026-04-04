import { describe, it, expect, vi, beforeEach } from "vitest";
import AbortProjectDialog from "../src/apps/dialogs/AbortProjectDialog.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("AbortProjectDialog.svelte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should mount and show project name", async () => {
    const target = document.createElement("div");
    const instance = mount(AbortProjectDialog, {
      target,
      props: { projectName: "Test Project", actorName: "Test Actor" },
    });
    await tick();

    expect(target.innerHTML).toContain("Test Project");
    expect(target.innerHTML).toContain("Test Actor");
    unmount(instance);
  });
});
