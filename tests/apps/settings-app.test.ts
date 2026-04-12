import { describe, it, expect, vi, beforeEach } from "vitest";
import { LearningConfigApp } from "../../src/apps/settings-app";
import { Settings } from "../../src/core/settings";
import { saveSettings } from "../../src/logic/settings-logic";

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

    const { unmount } = await import("svelte");
    await app.close();
    expect(unmount).toHaveBeenCalledWith(mockInstance);
    expect((app as unknown as { svelteInstance: any }).svelteInstance).toBeNull();
  });

  it("should mount Svelte component on _onRender", async () => {
    const app = new LearningConfigApp();

    const { mount } = await import("svelte");

    // @ts-ignore
    await app._onRender({}, {});

    expect(mount).toHaveBeenCalled();
    expect((app as any).svelteInstance).toBeDefined();
  });
});

describe("SettingsConfig logic", () => {
  const fullRules: import("../../src/types").SystemRules = {
    nonBulkMethod: "direct",
    bulkMethod: "direct",
    rollMode: "gmroll",
    checkDC: 10,
    checkFormula: "",
    critDoubleStrategy: "never",
    critThreshold: 20,
    notificationLevel: "info",
    bulkExpectedFormula: "",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Settings getters
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "rules") return { ...fullRules };
      if (key === "timeUnits") return [];
      if (key === "guidanceTiers") return [];
      if (key === "allowedCompendiums") return [];
      return null;
    });

    game.user.isGM = true;
    (game.packs as any).contents = [];
  });

  it("should notify user on successful save", async () => {
    vi.spyOn(Settings, "set").mockResolvedValue(undefined);

    await saveSettings(fullRules, [], [], [], [], false, []);

    expect(ui.notifications.info).toHaveBeenCalledWith(
      expect.stringContaining("saved successfully"),
    );
  });

  it("should notify user on failed save", async () => {
    // This tests the logic used by the SettingsConfig component's save() handler.
    const error = new Error("Save failed!");
    vi.spyOn(Settings, "set").mockRejectedValue(error);

    await saveSettings(fullRules, [], [], [], [], false, []);

    expect(ui.notifications.error).toHaveBeenCalledWith(expect.stringContaining("Save failed!"));
    expect(ui.notifications.info).not.toHaveBeenCalled();
  });
});
