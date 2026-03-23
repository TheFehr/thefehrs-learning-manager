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
        system: {
          activities: {},
          description: { value: "Original Description" },
        },
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
            name: "Reward (0/10)",
            type: "feat",
            system: expect.objectContaining({
              description: expect.objectContaining({
                value: expect.stringContaining("Training Progress"),
              }),
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
                  stashedName: "Reward",
                  stashedDescription: "Original Description",
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

  describe("completeProject", () => {
    it("should create a new item from source and delete the old one if source is found", async () => {
      const actor = new Actor() as any;
      actor.createEmbeddedDocuments = vi
        .fn()
        .mockResolvedValue([{ name: "Source Item", type: "weapon" }]);

      const projectDataFlags = {
        stashedSourceUuid: "Compendium.some.uuid",
        target: 10,
        progress: 10,
        isCompleted: false,
      };

      const item = new Item() as any;
      item.actor = actor;
      item.delete = vi.fn().mockResolvedValue(true);
      item.getFlag = vi.fn().mockImplementation((scope: string, key: string) => {
        if (key === "isLearningProject") return true;
        if (key === "projectData") return projectDataFlags;
        return null;
      });

      const sourceItem = new Item() as any;
      sourceItem.toObject.mockReturnValue({
        name: "Source Item",
        type: "weapon",
        system: { damage: "1d8" },
        effects: [],
      });

      global.fromUuid = vi.fn().mockResolvedValue(sourceItem);

      await ProjectEngine.completeProject(item);

      expect(global.fromUuid).toHaveBeenCalledWith("Compendium.some.uuid");
      expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
        expect.objectContaining({
          name: "Source Item",
          type: "weapon",
          system: { damage: "1d8" },
          "flags.thefehrs-learning-manager": expect.objectContaining({
            isLearningProject: false,
            isLearnedReward: true,
            projectData: expect.objectContaining({ isCompleted: true }),
          }),
        }),
      ]);
      expect(item.delete).toHaveBeenCalled();
    });

    it("should fallback to in-place restore if source is not found", async () => {
      const actor = new Actor() as any;
      const projectDataFlags = {
        stashedSourceUuid: "Compendium.missing.uuid",
        stashedName: "Stashed Name",
        target: 10,
        progress: 10,
        isCompleted: false,
      };

      const item = new Item() as any;
      item.actor = actor;
      item.name = "Learning Project";
      item.type = "feat";
      item.delete = vi.fn();
      const activitiesMap = new Map([
        [
          "act1",
          { id: "act1", flags: { "thefehrs-learning-manager": { isLearningActivity: true } } },
        ],
        ["act2", { id: "act2" }],
      ]);
      item.system = {
        activities: activitiesMap,
      };
      item.getFlag = vi.fn().mockImplementation((scope: string, key: string) => {
        if (key === "isLearningProject") return true;
        if (key === "projectData") return projectDataFlags;
        if (key === "stashedSystem") return { original: true };
        if (key === "stashedType") return "weapon";
        if (key === "stashedActivities") return { act3: {} };
        return null;
      });

      global.fromUuid = vi.fn().mockRejectedValue(new Error("Not found"));

      await ProjectEngine.completeProject(item);

      expect(item.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Stashed Name",
          type: "weapon",
          system: expect.objectContaining({
            original: true,
            activities: expect.objectContaining({
              act3: {},
              "-=act1": null,
            }),
          }),
          "flags.thefehrs-learning-manager": expect.objectContaining({
            isLearnedReward: true,
          }),
        }),
      );
      expect(item.delete).not.toHaveBeenCalled();
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
      item.system = { description: { value: "" } };
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
      item.system = { description: { value: "" } };
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

    it("should not duplicate progress indicators in name and description", async () => {
      const actor = new Actor() as any;
      actor.flags = { "thefehrs-learning-manager": { bank: { total: 100 } } };
      actor.system = { currency: { gp: 10, sp: 0, cp: 0 } };

      const item = new Item() as any;
      item.actor = actor;
      item.name = "Project (5/10) (5/10)";
      item.system = {
        description: {
          value: "Current Mangled Description",
        },
      };

      const projectData = {
        progress: 5,
        target: 10,
        tutelageId: "",
        stashedName: "Project",
        stashedDescription: "Real Content",
      };

      item.getFlag = vi.fn().mockReturnValue(projectData);

      const activity = {
        item,
        flags: { "thefehrs-learning-manager": { timeUnitId: "hour" } },
      };

      vi.mocked(TabLogic.computeProgress).mockResolvedValueOnce({ progressGained: 1 });
      vi.spyOn(Settings, "timeUnits", "get").mockReturnValue(timeUnits);

      await ProjectEngine.processTraining(activity as any);

      expect(item.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Project (6/10)",
          "system.description.value": expect.stringMatching(
            /<!-- learning-manager:progress-start -->[\s\S]*?<!-- learning-manager:progress-end -->Real Content/,
          ),
        }),
      );

      const lastUpdate = vi.mocked(item.update).mock.lastCall![0];
      const desc = lastUpdate["system.description.value"];
      expect(desc).not.toContain("Current Mangled Description");
      expect(desc).toContain("Real Content");
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
