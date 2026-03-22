import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectEngine } from "../src/project-engine";
import { Settings } from "../src/core/settings";
import { LearningManager } from "../src/LearningManager";
import { TabLogic } from "../src/tab-logic";

vi.mock("../src/tab-logic", () => ({
  TabLogic: {
    computeProgress: vi.fn().mockResolvedValue({ progressGained: 1 }),
    deductCurrency: vi.fn().mockResolvedValue(true),
  },
}));

describe("ProjectEngine", () => {
  const timeUnits = [
    { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
    { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.Item = class {
      constructor() {}
      update = vi.fn().mockResolvedValue(this);
      createEmbeddedDocuments = vi.fn().mockResolvedValue([]);
      getFlag = vi.fn();
      setFlag = vi.fn();
      name = "Mock Item";
      toObject = vi.fn();
      system = { activities: {} };
    } as any;

    // Default mocks that can be overridden in specific tests
    vi.spyOn(Settings, "timeUnits", "get").mockReturnValue(timeUnits);
    vi.spyOn(Settings, "rules", "get").mockReturnValue({ method: "direct" } as any);
    vi.spyOn(Settings, "guidanceTiers", "get").mockReturnValue([]);

    global.game = {
      settings: {
        get: vi.fn().mockImplementation((_scope, key) => {
          if (key === "timeUnits") return timeUnits;
          if (key === "rules") return { method: "direct" };
          return null;
        }),
      },
      user: { isGM: true },
    } as any;
  });

  describe("initiateProjectFromItem", () => {
    it("should create a stashed item on the actor with feat type", async () => {
      const actor = new Actor() as any;
      const createdItem = new Item() as any;
      createdItem.getFlag.mockImplementation((scope: string, key: string) => {
        if (key === "projectData") return { target: 10, requirements: [] };
        return null;
      });
      actor.createEmbeddedDocuments = vi.fn().mockResolvedValue([createdItem]);

      const rewardItem = new Item() as any;
      rewardItem.name = "Reward";
      rewardItem.type = "weapon";
      rewardItem.toObject.mockReturnValue({
        name: "Reward",
        type: "weapon",
        system: { activities: {} },
        effects: [],
      });
      rewardItem.getFlag.mockImplementation((scope: string, key: string) => {
        if (key === "projectData") return { target: 10, requirements: [] };
        return null;
      });

      const result = await ProjectEngine.initiateProjectFromItem(actor, rewardItem, "tier1");

      expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith(
        "Item",
        expect.arrayContaining([
          expect.objectContaining({
            name: "Reward",
            type: "feat",
            system: expect.objectContaining({
              type: expect.objectContaining({
                value: "learning-project",
              }),
            }),
            flags: expect.objectContaining({
              "thefehrs-learning-manager": expect.objectContaining({
                isLearningProject: true,
                projectData: expect.objectContaining({
                  progress: 0,
                  target: 10,
                  tutelageId: "tier1",
                }),
              }),
            }),
          }),
        ]),
      );
      expect(result).toBe(createdItem);
    });
  });

  describe("injectActivities", () => {
    it("should add training activities to the item", async () => {
      const item = new Item() as any;
      item.getFlag.mockImplementation((scope: string, key: string) => {
        if (key === "projectData") return { target: 10 };
        return null;
      });

      vi.spyOn(Settings, "timeUnits", "get").mockReturnValue(timeUnits);

      await ProjectEngine.injectActivities(item);

      expect(item.update).toHaveBeenCalledWith(
        expect.objectContaining({
          "system.activities": expect.any(Object),
        }),
      );
    });

    it("should skip injection if target is 0", async () => {
      const item = new Item() as any;
      item.getFlag.mockImplementation((scope: string, key: string) => {
        if (key === "projectData") return { target: 0 };
        return null;
      });

      await ProjectEngine.injectActivities(item);
      expect(item.update).not.toHaveBeenCalled();
    });
  });

  describe("processTraining", () => {
    it("should progress the project and handle completion", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        "thefehrs-learning-manager": {
          bank: { total: 100 },
        },
      };
      actor.system = { currency: { gp: 10, sp: 0, cp: 0 } };

      const projectData = {
        id: "p1",
        templateId: "tpl1",
        progress: 9,
        target: 10,
        tutelageId: "",
        isCompleted: false,
      };

      const item = new Item() as any;
      item.actor = actor;
      item.type = "feat";
      item.getFlag = vi.fn().mockImplementation((_scope, key) => {
        if (key === "isLearningProject") return true;
        if (key === "projectData") return { ...projectData };
        if (key === "stashedEffects") return [];
        if (key === "stashedActivities") return {};
        if (key === "stashedType") return "weapon";
        return null;
      });
      item.name = "Learning Item";

      const activity = {
        item,
        flags: {
          "thefehrs-learning-manager": {
            timeUnitId: "hour",
          },
        },
      };

      vi.spyOn(Settings, "timeUnits", "get").mockReturnValue(timeUnits);

      const result = await ProjectEngine.processTraining(activity as any);

      expect(result).toBe(true);
      // Check for completion update
      expect(item.update).toHaveBeenCalled();
      const lastUpdate = vi.mocked(item.update).mock.lastCall![0];
      expect(lastUpdate.type).toBe("weapon");
      expect(lastUpdate["flags.thefehrs-learning-manager"]).toEqual(
        expect.objectContaining({
          isLearnedReward: true,
        }),
      );

      expect(actor.setFlag).toHaveBeenCalledWith(
        "thefehrs-learning-manager",
        "bank",
        expect.objectContaining({ total: 99 }),
      );
    });

    it("should whisper the roll to the player and GM", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        "thefehrs-learning-manager": {
          bank: { total: 100 },
        },
      };
      actor.system = { currency: { gp: 10, sp: 0, cp: 0 } };

      const item = new Item() as any;
      item.actor = actor;
      item.getFlag = vi.fn().mockReturnValue({ target: 10, progress: 0 });

      const activity = {
        item,
        flags: {
          "thefehrs-learning-manager": {
            timeUnitId: "hour",
          },
        },
      };

      const mockRoll = {
        toMessage: vi.fn(),
      };

      vi.mocked(TabLogic.computeProgress).mockResolvedValueOnce({
        progressGained: 1,
        roll: mockRoll as any,
      });

      vi.spyOn(Settings, "rules", "get").mockReturnValue({
        method: "roll",
        rollMode: "blindroll",
        checkDC: 10,
      } as any);

      await ProjectEngine.processTraining(activity as any);

      expect(mockRoll.toMessage).toHaveBeenCalledWith(
        expect.objectContaining({ flavor: expect.any(String) }),
        expect.objectContaining({ rollMode: "blindroll" }),
      );
    });

    it("should notify user with reason on failed training", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        "thefehrs-learning-manager": {
          bank: { total: 100 },
        },
      };
      actor.system = { currency: { gp: 10, sp: 0, cp: 0 } };

      const projectData = {
        target: 10,
        progress: 0,
        tutelageId: "",
      };

      const item = new Item() as any;
      item.actor = actor;
      item.getFlag = vi.fn().mockImplementation((_scope, key) => {
        if (key === "projectData") return { ...projectData };
        return null;
      });

      const activity = {
        item,
        flags: {
          "thefehrs-learning-manager": {
            timeUnitId: "hour",
          },
        },
      };

      vi.mocked(TabLogic.computeProgress).mockResolvedValueOnce({
        progressGained: 0,
        reason: "Mock failure reason",
      });

      await ProjectEngine.processTraining(activity as any);

      expect(ui.notifications.info).toHaveBeenCalledWith(
        "Training unsuccessful: Mock failure reason",
      );
    });
  });

  describe("syncAllProjectActivities", () => {
    it("should regenerate activities for all learning projects", async () => {
      const item = new Item() as any;
      item.getFlag.mockImplementation((scope: string, key: string) => {
        if (key === "isLearningProject") return true;
        if (key === "projectData") return { target: 10 };
        return null;
      });

      const actor = new Actor() as any;
      actor.items = [item];
      game.actors = [actor] as any;
      game.user.isGM = true;

      await ProjectEngine.syncAllProjectActivities();

      expect(item.update).toHaveBeenCalled();
    });
  });

  describe("getActivitiesData", () => {
    it("should return empty array for 0 target", () => {
      const data = ProjectEngine.getActivitiesData(0);
      expect(data).toHaveLength(0);
    });

    it("should return activities for positive target", () => {
      vi.spyOn(Settings, "timeUnits", "get").mockReturnValue(timeUnits);
      const data = ProjectEngine.getActivitiesData(10);
      expect(data).toHaveLength(2);
    });
  });
});
