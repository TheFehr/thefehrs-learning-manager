import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../src/core/notifications";
import { Settings } from "../src/core/settings";

vi.mock("../src/core/settings", () => ({
  Settings: {
    get: vi.fn(),
  },
}));

describe("Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = {
      notifications: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      },
    };
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).ui;
  });

  it("should show info notification and log to console", () => {
    vi.spyOn(Settings, "get").mockReturnValue({ notificationLevel: "info" } as any);
    Logger.info("test info");
    expect(ui.notifications.info).toHaveBeenCalledWith("test info");
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("test info"));
  });

  it("should respect notification level (error only)", () => {
    vi.spyOn(Settings, "get").mockReturnValue({ notificationLevel: "error" } as any);
    Logger.info("hidden info");
    expect(ui.notifications.info).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();

    Logger.error("visible error");
    expect(ui.notifications.error).toHaveBeenCalledWith("visible error");
  });

  it("should handle debug logs", () => {
    vi.spyOn(Settings, "get").mockReturnValue({ notificationLevel: "debug" } as any);
    Logger.debug("debug message", { key: "val" });
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining("debug message"), {
      key: "val",
    });
  });

  it("should handle UI failure gracefully", () => {
    (ui.notifications.info as any).mockImplementation(() => {
      throw new Error("UI dead");
    });
    Logger.info("message");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("UI notification failed"),
      expect.any(Error),
    );
  });
});
