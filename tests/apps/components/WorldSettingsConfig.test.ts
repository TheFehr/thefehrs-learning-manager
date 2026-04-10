import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import WorldSettingsConfig from "../../../src/apps/components/WorldSettingsConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("WorldSettingsConfig.svelte", () => {
  let instance: any;
  let target: HTMLElement;

  const mockProps = {
    rules: { nonBulkMethod: "roll", bulkMethod: "mathematical" },
    timeUnits: [],
    teacherCompendiums: [],
    bookCompendiums: [],
    allowedCompendiums: [],
    availableItemPacks: [],
    instructorPacks: [],
    bookPacks: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = { notifications: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } };
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) {
      unmount(instance);
    }
    instance = undefined;
    target.remove();
    delete (global as any).ui;
  });

  it("should mount and show sections", async () => {
    instance = mount(WorldSettingsConfig, {
      target,
      props: mockProps as any,
    });
    await tick();

    expect(target.innerHTML).toContain("Global Rules");
    expect(target.innerHTML).toContain("Time Units");
    expect(target.innerHTML).toContain("Instructor Compendiums");
    expect(target.innerHTML).toContain("Book Compendiums");
  });
});
