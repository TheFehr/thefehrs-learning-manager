import { describe, it, expect, vi, beforeEach } from "vitest";
import { LearningConfigApp } from "../src/apps/settings-app";
import { Settings } from "../src/core/settings";
import SettingsConfig from "../src/apps/SettingsConfig.svelte";
import { saveSettings } from "../src/apps/settings-logic";

describe("LearningConfigApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have correct default options", () => {
    expect(LearningConfigApp.DEFAULT_OPTIONS).toMatchObject({
      id: "learning-config-app",
      window: { title: "Downtime Engine Configuration" },
    });
  });

  it("should unmount Svelte instance on close", async () => {
    const app = new LearningConfigApp();
    const mockInstance = { some: "instance" };
    (app as unknown as { svelteInstance: any }).svelteInstance = mockInstance;

    await app.close();
    expect((app as unknown as { svelteInstance: any }).svelteInstance).toBeNull();
  });
});

describe("SettingsConfig logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Settings getters
    vi.spyOn(Settings, "rules", "get").mockReturnValue({ method: "direct" });
    vi.spyOn(Settings, "timeUnits", "get").mockReturnValue([]);
    vi.spyOn(Settings, "guidanceTiers", "get").mockReturnValue([]);
    vi.spyOn(Settings, "allowedCompendiums", "get").mockReturnValue([]);

    global.game = {
      packs: {
        filter: vi.fn().mockReturnValue([]),
      },
    } as any;
  });

  it("should notify user on successful save", async () => {
    vi.spyOn(Settings, "setRules").mockResolvedValue(undefined);
    vi.spyOn(Settings, "setTimeUnits").mockResolvedValue(undefined);
    vi.spyOn(Settings, "setGuidanceTiers").mockResolvedValue(undefined);
    vi.spyOn(Settings, "setAllowedCompendiums").mockResolvedValue(undefined);

    await saveSettings({ method: "direct" }, [], [], []);

    expect(ui.notifications.info).toHaveBeenCalledWith(
      expect.stringContaining("saved successfully"),
    );
  });

  it("should notify user on failed save", async () => {
    // This tests the logic used by the SettingsConfig component's save() handler.
    const error = new Error("Save failed!");
    vi.spyOn(Settings, "setRules").mockRejectedValue(error);

    await saveSettings({ method: "direct" }, [], [], []);

    expect(ui.notifications.error).toHaveBeenCalledWith(expect.stringContaining("Save failed!"));
    expect(ui.notifications.info).not.toHaveBeenCalled();
  });
});
