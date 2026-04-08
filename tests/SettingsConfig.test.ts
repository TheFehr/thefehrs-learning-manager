import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import SettingsConfig from "../src/apps/SettingsConfig.svelte";
import { mount, unmount, tick } from "svelte";
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
  let instance: any;
  let target: HTMLElement;

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

  it("should mount for GM", async () => {
    instance = mount(SettingsConfig, {
      target,
      props: {},
    });
    await tick();

    expect(instance).toBeDefined();
    expect(target.innerHTML).toContain("thefehrs-settings");
    expect(target.innerHTML).toContain("Global Rules");
  });

  it("should mount for non-GM", async () => {
    toggleUserGM(false);
    instance = mount(SettingsConfig, {
      target,
      props: {},
    });
    await tick();

    expect(instance).toBeDefined();
    expect(target.innerHTML).toContain("User Preferences");
  });
});
