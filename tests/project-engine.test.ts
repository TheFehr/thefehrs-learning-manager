import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectEngine } from "../src/project-engine";
import { Settings } from "../src/settings";
import { TheFehrsLearningManager } from "../src/main";
import { TabLogic } from "../src/tabs/tab-logic";

vi.mock("../src/tabs/tab-logic", () => ({
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

  const template = {
    id: "tpl1",
    name: "Test Project",
    target: 10,
    rewardUuid: "Item.123",
    rewardType: "item" as const,
    requirements: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.Item = class {
      constructor() {}
      update = vi.fn().mockResolvedValue(this);
      getFlag = vi.fn();
      setFlag = vi.fn();
      name = "Mock Item";
      toObject = vi.fn();
    } as any;

    // Default mocks that can be overridden in specific tests
    vi.spyOn(Settings, "timeUnits", "get").mockReturnValue(timeUnits);
    vi.spyOn(Settings, "rules", "get").mockReturnValue({ method: "direct" });
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
        if (key === "") return { projectData: { target: 10 } };
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
        if (key === "") return { projectData: { target: 10 } };
        return null;
      });

      const result = await ProjectEngine.initiateProjectFromItem(actor, rewardItem, "tier1");

      expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith(
        "Item",
        expect.arrayContaining([
          expect.objectContaining({
            name: "Reward",
            type: "feat",
            "system.type.value": "learningProject",
            "flags.thefehrs-learning-manager": expect.objectContaining({
              isLearningProject: true,
              stashedType: "weapon",
              projectData: expect.objectContaining({
                progress: 0,
                target: 10,
              }),
            }),
          }),
        ]),
      );
      expect(result).toBe(createdItem);
      expect(createdItem.update).toHaveBeenCalled();
    });
  });

  describe("injectActivities", () => {
    it("should add training activities to the item", async () => {
      const item = new Item() as any;
      item.getFlag.mockImplementation((scope: string, key: string) => {
        if (key === "") return { projectData: { target: 10 } };
        return null;
      });

      let callCount = 0;
      vi.mocked(foundry.utils.randomID).mockImplementation(() => `id-${callCount++}`);

      vi.spyOn(Settings, "timeUnits", "get").mockReturnValue(timeUnits);

      await ProjectEngine.injectActivities(item);

      const updateCall = vi.mocked(item.update).mock.calls[0][0];
      const activities = updateCall.system.activities;
      const activityEntries = Object.values(activities);

      expect(activityEntries.length).toBe(2);
      expect(activityEntries).toContainEqual(
        expect.objectContaining({
          name: "Train Hour",
        }),
      );
      expect(activityEntries).toContainEqual(
        expect.objectContaining({
          name: "Train Day",
        }),
      );
    });

    it("should skip injection if target is 0", async () => {
      const item = new Item() as any;
      item.getFlag.mockReturnValue({ target: 0 });

      await ProjectEngine.injectActivities(item);
      expect(item.update).not.toHaveBeenCalled();
    });
  });

  describe("processTraining", () => {
    it("should progress the project and handle completion", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        [TheFehrsLearningManager.ID]: {
          bank: { total: 100 },
        },
      };
      actor.system = { currency: { gp: 10, sp: 0, cp: 0 } };

      const projectData = {
        id: "p1",
        templateId: "tpl1",
        progress: 9,
        target: 10,
        guidanceTierId: "",
        isCompleted: false,
      };

      const item = new Item() as any;
      item.actor = actor;
      item.type = "feat";
      item.getFlag = vi.fn().mockImplementation((_scope, key) => {
        if (key === "isLearningProject") return true;
        if (key === "")
          return {
            isLearningProject: true,
            projectData: { ...projectData },
            stashedEffects: [],
            stashedActivities: {},
            stashedType: "weapon",
          };
        return null;
      });
      item.name = "Learning Item";

      vi.spyOn(Settings, "timeUnits", "get").mockReturnValue(timeUnits);

      await ProjectEngine.processTraining(item, "hour");

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
        TheFehrsLearningManager.ID,
        "bank",
        expect.objectContaining({ total: 99 }),
      );
    });
  });
});
