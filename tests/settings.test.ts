import { describe, it, expect, vi, beforeEach } from "vitest";
import { Settings, SettingsManager } from "../src/core/settings";

describe("SettingsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).game = {
      settings: {
        get: vi.fn(),
        set: vi.fn(),
        register: vi.fn(),
        registerMenu: vi.fn(),
      },
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("should have correct ID", () => {
    expect(Settings.ID).toBe("thefehrs-learning-manager");
  });

  it("should register all settings", () => {
    SettingsManager.registerAll();
    expect(game.settings.register).toHaveBeenCalled();
  });

  it("should get and set settings", async () => {
    vi.mocked(game.settings.get).mockReturnValue("value");
    expect(Settings.get("migrationVersion")).toBe("value");

    await Settings.set("migrationVersion", "new-value");
    expect(game.settings.set).toHaveBeenCalledWith(Settings.ID, "migrationVersion", "new-value");
  });

  it("should provide legacy accessors with defaults and warnings", () => {
    vi.mocked(game.settings.get).mockReturnValue(undefined);

    expect(Settings.timeUnits).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("'timeUnits' is uninitialized"),
    );

    expect(Settings.autoSpend).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("'autoSpend' is uninitialized"),
    );
  });

  it("should register menu", () => {
    Settings.registerMenu("test", {});
    expect(game.settings.registerMenu).toHaveBeenCalledWith(Settings.ID, "test", {});
  });
});
