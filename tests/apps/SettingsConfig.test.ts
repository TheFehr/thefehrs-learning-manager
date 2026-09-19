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

  it("should show a saving indicator while the save is in flight", async () => {
    let resolveSave: (v: boolean) => void;
    vi.mocked(settingsLogic.saveSettings).mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveSave = resolve;
      }),
    );

    instance = mount(SettingsConfig, {
      target,
      props: {},
    });
    await tick();

    const saveBtn = target.querySelector("button.primary") as HTMLButtonElement;
    saveBtn.click();
    await tick();

    expect(target.innerHTML).toContain("Saving...");

    resolveSave!(true);
    await tick();
  });

  it("should disable the save button and ignore repeated clicks while a save is in flight", async () => {
    let resolveSave: (v: boolean) => void;
    vi.mocked(settingsLogic.saveSettings).mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveSave = resolve;
      }),
    );

    instance = mount(SettingsConfig, {
      target,
      props: {},
    });
    await tick();

    const saveBtn = target.querySelector("button.primary") as HTMLButtonElement;
    saveBtn.click();
    await tick();

    expect(saveBtn.disabled).toBe(true);

    // A second click while the first save is still in flight (e.g. a
    // double-click, or a slow Settings.set() on the first call) must not
    // start a second concurrent save - two overlapping writes could
    // otherwise race, with the older one clobbering a newer edit.
    saveBtn.click();
    await tick();

    expect(settingsLogic.saveSettings).toHaveBeenCalledTimes(1);

    resolveSave!(true);
    await tick();
    await tick();

    expect(saveBtn.disabled).toBe(false);
  });

  it("should show a saved indicator after a successful save, without autosaving on field changes", async () => {
    vi.mocked(settingsLogic.saveSettings).mockResolvedValueOnce(true);

    instance = mount(SettingsConfig, {
      target,
      props: {},
    });
    await tick();

    // No save yet - shouldn't claim anything is saved.
    expect(target.innerHTML).not.toContain("All changes saved");

    const saveBtn = target.querySelector("button.primary") as HTMLButtonElement;
    saveBtn.click();
    await tick();
    await tick();

    expect(target.innerHTML).toContain("All changes saved");
  });

  it("should clear the saved indicator once a setting changes again", async () => {
    vi.mocked(settingsLogic.saveSettings).mockResolvedValueOnce(true);

    instance = mount(SettingsConfig, {
      target,
      props: {},
    });
    await tick();

    const saveBtn = target.querySelector("button.primary") as HTMLButtonElement;
    saveBtn.click();
    await tick();
    await tick();

    expect(target.innerHTML).toContain("All changes saved");

    const scanCheckbox = target.querySelector("#scan-world-actors") as HTMLInputElement;
    expect(scanCheckbox).not.toBeNull();
    scanCheckbox.click();
    await tick();

    expect(target.innerHTML).not.toContain("All changes saved");
  });

  it("should show an error indicator when save fails", async () => {
    vi.mocked(settingsLogic.saveSettings).mockResolvedValueOnce(false);

    instance = mount(SettingsConfig, {
      target,
      props: {},
    });
    await tick();

    const saveBtn = target.querySelector("button.primary") as HTMLButtonElement;
    saveBtn.click();
    await tick();
    await tick();

    expect(target.innerHTML).toContain("Failed to save settings");
  });
});
