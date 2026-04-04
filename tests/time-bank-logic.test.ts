import { describe, it, expect, vi, beforeEach } from "vitest";
import { TimeBankLogic } from "../src/apps/time-bank-logic";

describe("TimeBankLogic", () => {
  const units = [
    { id: "day", ratio: 10 },
    { id: "hour", ratio: 1 },
  ] as any[];

  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = { notifications: { warn: vi.fn() } };
  });

  describe("getTimeValue", () => {
    it("should return the correct count for a unit", () => {
      // 15 hours = 1 day and 5 hours
      expect(TimeBankLogic.getTimeValue(units[0], 15, units)).toBe(1);
      expect(TimeBankLogic.getTimeValue(units[1], 15, units)).toBe(5);
    });

    it("should return 0 for non-existent units", () => {
      expect(TimeBankLogic.getTimeValue({ id: "week" } as any, 100, units)).toBe(0);
    });
  });

  describe("updateTime", () => {
    it("should call setBank with updated total", async () => {
      const mockProxy = { setBank: vi.fn().mockResolvedValue(true) };
      // Current: 15h (1d 5h). New: 2d (so add 1 day = 10h)
      await TimeBankLogic.updateTime(units[0], "2", mockProxy as any, 15, units);

      expect(mockProxy.setBank).toHaveBeenCalledWith({ total: 25 });
    });

    it("should handle decreasing values", async () => {
      const mockProxy = { setBank: vi.fn().mockResolvedValue(true) };
      // Current: 15h. New: 0d (so remove 1 day = 10h)
      await TimeBankLogic.updateTime(units[0], "0", mockProxy as any, 15, units);

      expect(mockProxy.setBank).toHaveBeenCalledWith({ total: 5 });
    });

    it("should do nothing if value is unchanged", async () => {
      const mockProxy = { setBank: vi.fn() };
      await TimeBankLogic.updateTime(units[0], "1", mockProxy as any, 15, units);
      expect(mockProxy.setBank).not.toHaveBeenCalled();
    });

    it("should warn on invalid input", async () => {
      await TimeBankLogic.updateTime(units[0], "abc", {} as any, 15, units);
      expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("Invalid"));
    });
  });
});
