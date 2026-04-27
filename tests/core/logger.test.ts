import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../../src/core/logger";

describe("Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).ui = {
      notifications: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      },
    };
    (globalThis as any).game = {
      settings: {
        get: vi.fn(),
      },
    };
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).ui;
    delete (globalThis as any).game;
  });

  it("should show info notification and log to console when uiNotify is true", () => {
    vi.mocked(game.settings.get).mockReturnValue({ notificationLevel: "info" } as any);
    Logger.info("test info", true);
    expect(ui.notifications.info).toHaveBeenCalledWith("test info");
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("test info"));
  });

  it("should respect notification level (error only)", () => {
    vi.mocked(game.settings.get).mockReturnValue({ notificationLevel: "error" } as any);
    Logger.info("hidden info", true);
    expect(ui.notifications.info).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();

    Logger.error("visible error");
    expect(ui.notifications.error).toHaveBeenCalledWith("visible error");
  });

  it("should handle debug logs", () => {
    vi.mocked(game.settings.get).mockReturnValue({ notificationLevel: "debug" } as any);
    Logger.debug("debug message", { key: "val" });
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining("debug message"), {
      key: "val",
    });
  });

  it("should handle UI failure gracefully", () => {
    vi.mocked(game.settings.get).mockReturnValue({ notificationLevel: "info" } as any);
    (ui.notifications.info as any).mockImplementation(() => {
      throw new Error("UI dead");
    });
    Logger.info("message", true);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("UI notification failed"),
      expect.any(Error),
    );
  });
});
