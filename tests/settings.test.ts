import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Settings, SettingsManager, SETTINGS_DEFINITIONS } from "../src/core/settings";

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
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).game;
  });

  it("should have correct ID", () => {
    expect(Settings.ID).toBe("thefehrs-learning-manager");
  });

  it("should register all settings", () => {
    SettingsManager.registerAll();
    const expectedCount = Object.keys(SETTINGS_DEFINITIONS).length;
    expect(game.settings.register).toHaveBeenCalledTimes(expectedCount);
  });

  it("should get and set settings", async () => {
    vi.mocked(game.settings.get).mockReturnValue("value");
    expect(Settings.get("migrationVersion")).toBe("value");

    await Settings.set("migrationVersion", "new-value");
    expect(game.settings.set).toHaveBeenCalledWith(Settings.ID, "migrationVersion", "new-value");
  });

  it("should provide accessors with defaults and debug logs", () => {
    vi.mocked(game.settings.get).mockReturnValue(undefined);

    expect(Settings.get("timeUnits")).toEqual(SETTINGS_DEFINITIONS.timeUnits.default);
    expect(console.debug).toHaveBeenCalledWith(
      expect.stringContaining("'timeUnits' is uninitialized"),
    );

    expect(Settings.get("autoSpend")).toBe(SETTINGS_DEFINITIONS.autoSpend.default);
    expect(console.debug).toHaveBeenCalledWith(
      expect.stringContaining("'autoSpend' is uninitialized"),
    );
  });

  it("should register menu", () => {
    const mockConfig = {
      name: "Test Menu",
      label: "Test Label",
      type: class {} as any,
      restricted: true,
    };
    Settings.registerMenu("test", mockConfig);
    expect(game.settings.registerMenu).toHaveBeenCalledWith(Settings.ID, "test", mockConfig);
  });
});
