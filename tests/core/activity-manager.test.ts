import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActivityManager } from "../../src/core/activity-manager";
import { Settings } from "../../src/core/settings";
import { Logger } from "../../src/core/logger";

// Mock Settings using the relative path to the source module
vi.mock("../../src/core/settings", () => ({
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

const mockUI = { notifications: { info: vi.fn(), warn: vi.fn() } };
const mockGame = {
  user: { isGM: true },
  actors: {
    contents: [],
  },
};

// Mock foundry using the relative path to the source module
vi.mock("../../src/core/foundry", () => ({
  getGame: vi.fn(() => mockGame),
  getUI: vi.fn(() => mockUI),
}));

describe("ActivityManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGame.actors.contents = [];
    mockGame.user.isGM = true;
    (globalThis as any).foundry = { utils: { randomID: vi.fn().mockReturnValue("rand123") } };
    vi.spyOn(Logger, "debug").mockImplementation(() => {});
    vi.spyOn(Logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).foundry;
  });

  describe("getActivitiesData", () => {
    it("should return empty array if target <= 0", () => {
      expect(ActivityManager.getActivitiesData(0)).toEqual([]);
    });

    it("should return activities for time units + spend all", () => {
      const data = ActivityManager.getActivitiesData(10);
      expect(data.length).toBeGreaterThanOrEqual(2);
      expect(data.some((a) => a.name === "Train Hour")).toBe(true);
      expect(data.some((a) => a.name === "Spend all time")).toBe(true);
    });
  });

  describe("injectActivities", () => {
    it("should update item with activities", async () => {
      const mockItem = {
        name: "Item",
        system: { activities: [] },
        update: vi.fn().mockResolvedValue(true),
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "projectData") return { target: 10 };
          return null;
        }),
      };

      await ActivityManager.injectActivities(mockItem as any);

      expect(mockItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          "system.activities": expect.any(Object),
        }),
        { render: false },
      );
    });

    it("should warn and return if missing projectData", async () => {
      const mockItem = { name: "Item", getFlag: vi.fn().mockReturnValue(null) };
      vi.spyOn(Logger, "warn").mockImplementation(() => {});

      await ActivityManager.injectActivities(mockItem as any);
      const warnMock = vi.mocked(Logger.warn);
      expect(warnMock.mock.calls[0][0]).toContain("missing projectData");
    });
  });

  describe("syncAllProjectActivities", () => {
    it("should handle mixed success/failure during sync", async () => {
      const mockItem1 = {
        name: "Item 1",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "isLearningProject") return true;
          return null;
        }),
      };

      const mockItem2 = {
        name: "Item 2",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "isLearningProject") return true;
          return null;
        }),
      };

      const actor = {
        name: "Actor",
        items: [mockItem1, mockItem2],
      };
      mockGame.actors.contents = [actor as any];

      // Direct implementation mock to ensure it correctly records failure
      const injectSpy = vi
        .spyOn(ActivityManager, "injectActivities")
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error("Fail"));

      await ActivityManager.syncAllProjectActivities();

      expect(mockUI.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("failed"));
    });

    it("should do nothing if not GM", async () => {
      mockGame.user.isGM = false;
      await ActivityManager.syncAllProjectActivities();
      expect(mockUI.notifications.info).not.toHaveBeenCalled();
    });
  });
});
