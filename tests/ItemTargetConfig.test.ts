import { describe, it, expect, vi, beforeEach } from "vitest";
import ItemTargetConfig from "../src/apps/tabs/ItemTargetConfig.svelte";
import { mount, unmount, tick } from "svelte";
import { toggleUserGM } from "./setup";

vi.unmock("svelte");

describe("ItemTargetConfig.svelte", () => {
  const mockItem = {
    id: "item1",
    name: "Mock Item",
    getFlag: vi.fn().mockReturnValue({ target: 10, followUpProjectId: "", requirements: [] }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    toggleUserGM(true);
  });

  it("should mount and show target input", async () => {
    const target = document.createElement("div");
    const instance = mount(ItemTargetConfig, {
      target,
      props: { item: mockItem },
    });
    await tick();

    expect(target.innerHTML).toContain("Target Progress");
    expect(target.querySelector("input[type='number']")).toBeDefined();
    unmount(instance);
  });
});
