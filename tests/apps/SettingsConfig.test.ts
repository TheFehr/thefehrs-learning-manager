import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import SettingsConfig from "@/apps/SettingsConfig.svelte";
import { mount, unmount, tick } from "svelte";
import { toggleUserGM } from "../setup";
import * as settingsLogic from "@/logic/settings-logic.js";

vi.unmock("svelte");

vi.mock("@/core/settings", () => ({
  Settings: {
    get: vi.fn().mockImplementation((key) => {
      if (key === "rules") return { nonBulkMethod: "roll", bulkMethod: "mathematical" };
      if (key === "timeUnits") return [];
      return [];
    }),
  },
}));

vi.mock("@/logic/settings-logic.js", () => ({
  saveSettings: vi.fn(),
  getAvailablePacks: vi.fn().mockResolvedValue([]),
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

  it("should trigger saveSettings when clicking the save button", async () => {
    instance = mount(SettingsConfig, {
      target,
      props: {},
    });
    await tick();

    const saveBtn = target.querySelector("button.primary") as HTMLButtonElement;
    expect(saveBtn).not.toBeNull();
    saveBtn.click();
    await tick();

    expect(settingsLogic.saveSettings).toHaveBeenCalled();
  });
});
