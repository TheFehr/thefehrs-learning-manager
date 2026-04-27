import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActivityManager } from "../../src/core/activity-manager";
import { Settings } from "../../src/core/settings";
import { Logger } from "../../src/core/logger";

vi.mock("@/core/settings", () => ({
  Settings: {
    get: vi.fn().mockImplementation((key) => {
      if (key === "timeUnits") {
        return [{ id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 }];
      }
      return null;
    }),
    ID: "thefehrs-learning-manager",
  },
}));

describe("ActivityManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
    (globalThis as any).game = { user: { isGM: true }, actors: [] };
    (globalThis as any).foundry = { utils: { randomID: vi.fn().mockReturnValue("rand123") } };
    vi.spyOn(Logger, "debug").mockImplementation(() => {});
    vi.spyOn(Logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).ui;
    delete (globalThis as any).game;
    delete (globalThis as any).foundry;
  });

  describe("getActivitiesData", () => {
    it("should return empty array if target <= 0", () => {
      expect(ActivityManager.getActivitiesData(0)).toEqual([]);
    });

    it("should return activities for time units + spend all", () => {
      const data = ActivityManager.getActivitiesData(10);
      expect(data).toHaveLength(2); // 1 unit + 1 spend all
      expect(data[0].name).toBe("Train Hour");
      expect(data[1].name).toBe("Spend all time");
    });

    it("should return empty array if timeUnits is not an array or is empty", () => {
      vi.mocked(Settings.get).mockReturnValueOnce(null);
      expect(ActivityManager.getActivitiesData(10)).toEqual([]);

      vi.mocked(Settings.get).mockReturnValueOnce([]);
      expect(ActivityManager.getActivitiesData(10)).toEqual([]);
    });
  });

  describe("injectActivities", () => {
    it("should update item with activities", async () => {
      const mockItem = {
        name: "Item",
        system: { activities: [] },
        update: vi.fn().mockResolvedValue(true),
        getFlag: vi.fn().mockReturnValue({ target: 10 }),
      };

      await ActivityManager.injectActivities(mockItem as any);

      expect(mockItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          "system.activities": expect.any(Object),
        }),
      );
    });

    it("should warn and return if missing projectData", async () => {
      const mockItem = { name: "Item", getFlag: vi.fn().mockReturnValue(null) };
      vi.spyOn(Logger, "warn").mockImplementation(() => {});

      await ActivityManager.injectActivities(mockItem as any);
      const warnMock = vi.mocked(Logger.warn);
      expect(warnMock.mock.calls[0][0]).toContain("missing projectData");
    });

    it("should clear activities if target is 0", async () => {
      const mockItem = {
        name: "Item",
        system: {
          activities: [
            { id: "act1", flags: { "thefehrs-learning-manager": { isLearningActivity: true } } },
          ],
        },
        update: vi.fn().mockResolvedValue(true),
        getFlag: vi.fn().mockReturnValue({ target: 0 }),
      };

      await ActivityManager.injectActivities(mockItem as any);
      expect(mockItem.update).toHaveBeenCalledWith({ "system.activities": { "-=act1": null } });
    });
  });

  describe("syncAllProjectActivities", () => {
    it("should handle mixed success/failure during sync", async () => {
      const mockItem1 = {
        name: "Item 1",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "isLearningProject") return true;
          if (key === "projectData") return { target: 10 };
          return null;
        }),
        update: vi.fn().mockResolvedValue(true),
        system: { activities: [] },
      };
      const mockItem2 = {
        name: "Item 2",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "isLearningProject") return true;
          if (key === "projectData") return { target: 10 };
          return null;
        }),
        update: vi.fn().mockRejectedValue(new Error("Fail")),
        system: { activities: [] },
      };
      const actor = { name: "Actor", items: [mockItem1, mockItem2] };
      game.actors = [actor as any];

      await ActivityManager.syncAllProjectActivities();

      expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("1 items failed"));
    });

    it("should do nothing if not GM", async () => {
      game.user.isGM = false;
      await ActivityManager.syncAllProjectActivities();
      expect(ui.notifications.info).not.toHaveBeenCalled();
    });
  });
});
