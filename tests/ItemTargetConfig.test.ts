import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ItemTargetConfig from "../src/apps/tabs/ItemTargetConfig.svelte";
import { mount, unmount, tick } from "svelte";
import { toggleUserGM } from "./setup";

vi.unmock("svelte");

describe("ItemTargetConfig.svelte", () => {
  let instance: any;
  let target: HTMLElement;

  const mockItem = {
    id: "item1",
    name: "Mock Item",
    getFlag: vi
      .fn()
      .mockReturnValue({ progress: 0, target: 10, followUpProjectId: "", requirements: [] }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    toggleUserGM(true);
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
  });

  it("should mount and show target input", async () => {
    instance = mount(ItemTargetConfig, {
      target,
      props: { item: mockItem },
    });
    await tick();

    expect(target.innerHTML).toContain("Target Progress");
    expect(target.querySelector("input[type='number']")).not.toBeNull();
  });
});
