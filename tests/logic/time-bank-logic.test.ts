import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimeBankLogic } from "../../src/logic/time-bank-logic";
import type { TimeUnit } from "../../src/types";

describe("TimeBankLogic", () => {
  const units: TimeUnit[] = [
    { id: "day", ratio: 10, name: "Day", short: "d", isBulk: true },
    { id: "hour", ratio: 1, name: "Hour", short: "h", isBulk: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = {
      notifications: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).ui;
  });

  describe("getTimeValue", () => {
    it("should return the correct count for a unit", () => {
      // 15 hours = 1 day and 5 hours
      expect(TimeBankLogic.getTimeValue(units[0] as any, 15, units as any)).toBe(1);
      expect(TimeBankLogic.getTimeValue(units[1] as any, 15, units as any)).toBe(5);
    });

    it("should return 0 for non-existent units", () => {
      expect(TimeBankLogic.getTimeValue({ id: "week" } as any, 100, units as any)).toBe(0);
    });
  });

  describe("updateTime", () => {
    it("should call setBank with updated total", async () => {
      const mockProxy = { setBank: vi.fn().mockResolvedValue(true) };
      // Current: 15h (1d 5h). New: 2d (so add 1 day = 10h)
      await TimeBankLogic.updateTime(units[0] as any, "2", mockProxy as any, 15, units as any);

      expect(mockProxy.setBank).toHaveBeenCalledWith({ total: 25 });
    });

    it("should handle decreasing values", async () => {
      const mockProxy = { setBank: vi.fn().mockResolvedValue(true) };
      // Current: 15h. New: 0d (so remove 1 day = 10h)
      await TimeBankLogic.updateTime(units[0] as any, "0", mockProxy as any, 15, units as any);

      expect(mockProxy.setBank).toHaveBeenCalledWith({ total: 5 });
    });

    it("should do nothing if value is unchanged", async () => {
      const mockProxy = { setBank: vi.fn() };
      await TimeBankLogic.updateTime(units[0] as any, "1", mockProxy as any, 15, units as any);
      expect(mockProxy.setBank).not.toHaveBeenCalled();
    });

    it("should warn on invalid input", async () => {
      await TimeBankLogic.updateTime(units[0] as any, "abc", {} as any, 15, units as any);
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("Invalid"));
    });

    it("should handle negative input strings by warning", async () => {
      await TimeBankLogic.updateTime(units[0] as any, "-5", {} as any, 15, units as any);
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("Invalid"));
    });

    it("should handle decimal input strings by floor behavior", async () => {
      const mockProxy = { setBank: vi.fn().mockResolvedValue(true) };
      // 1.5d => 1d (due to Math.floor). Current 15h (1d 5h). New total 15 - 10 + 10 = 15. diff 0.
      await TimeBankLogic.updateTime(units[0] as any, "1.5", mockProxy as any, 15, units as any);
      expect(mockProxy.setBank).not.toHaveBeenCalled();
    });

    it("should handle setBank rejection and log error", async () => {
      const mockProxy = { setBank: vi.fn().mockRejectedValue(new Error("Fail")) };
      vi.spyOn(console, "error").mockImplementation(() => {});

      await TimeBankLogic.updateTime(units[0] as any, "2", mockProxy as any, 15, units as any);

      expect(console.error).toHaveBeenCalled();
      expect(global.ui.notifications.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update"),
      );
    });

    it("should handle zero total scenario correctly", async () => {
      const mockProxy = { setBank: vi.fn().mockResolvedValue(true) };
      // New value 1d (10h). Current 0h. diff +10h.
      await TimeBankLogic.updateTime(units[0] as any, "1", mockProxy as any, 0, units as any);
      expect(mockProxy.setBank).toHaveBeenCalledWith({ total: 10 });
    });
  });
});
