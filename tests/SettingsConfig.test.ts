import { describe, it, expect, vi, beforeEach } from "vitest";
import SettingsConfig from "../src/apps/SettingsConfig.svelte";
import { mount, unmount, tick } from "svelte";
import { Settings } from "../src/core/settings";
import { toggleUserGM } from "./setup";

vi.unmock("svelte");

vi.mock("../src/core/settings", () => ({
  Settings: {
    rules: { nonBulkMethod: "roll", bulkMethod: "mathematical" },
    timeUnits: [],
    guidanceTiers: [],
    allowedCompendiums: [],
    get: vi.fn().mockReturnValue([]),
  },
}));

describe("SettingsConfig.svelte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toggleUserGM(true);
  });

  it("should mount for GM", async () => {
    const target = document.createElement("div");
    const instance = mount(SettingsConfig, {
      target,
      props: {},
    });
    const { tick } = await import("svelte");
    await tick();

    expect(instance).toBeDefined();
    expect(target.innerHTML).toContain("thefehrs-settings");
    unmount(instance);
  });

  it("should mount for non-GM", () => {
    (game.user as any).isGM = false;
    const target = document.createElement("div");
    const instance = mount(SettingsConfig, {
      target,
      props: {},
    });
    expect(instance).toBeDefined();
    unmount(instance);
  });
});
