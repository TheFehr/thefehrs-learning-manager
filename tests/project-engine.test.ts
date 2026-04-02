import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectEngine } from "../src/project-engine";
import { Settings } from "../src/core/settings";
import { LearningManager } from "../src/LearningManager";
import { TabLogic } from "../src/tab-logic";
import { Socket } from "../src/core/socket";
import { ActorProxy } from "../src/actor-proxy";

vi.mock("../src/tab-logic", () => ({
  TabLogic: {
    computeProgress: vi.fn().mockResolvedValue({ progressGained: 1 }),
    deductCurrency: vi.fn().mockResolvedValue(true),
    formatCurrency: vi.fn().mockReturnValue("1gp"),
    formatTimeBank: vi.fn().mockReturnValue("1h"),
  },
}));

describe("ProjectEngine", () => {
  const timeUnits = [
    { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
    { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
  ];

  const guidanceTiers = [
    {
      id: "tier1",
      name: "Tier 1",
      modifier: 2,
      costs: { hour: 1, day: 10 },
      progress: { hour: 1, day: 10 },
    },
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
    vi.spyOn(Settings, "guidanceTiers", "get").mockReturnValue(guidanceTiers);

    global.game = {
      settings: {
        get: vi.fn().mockImplementation((_scope, key) => {
          if (key === "timeUnits") return timeUnits;
          if (key === "rules") return { method: "direct" };
          if (key === "guidanceTiers") return guidanceTiers;
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
        if (key === "projectData") return { target: 10, requirements: [], tutelageId: "tier1" };
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
        if (key === "projectData") return { target: 10, tutelageId: "tier1" };
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
        if (key === "projectData") return { target: 0, tutelageId: "tier1" };
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
        tutelageId: "tier1",
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
          flags: expect.objectContaining({
            "thefehrs-learning-manager": expect.objectContaining({
              isLearningProject: false,
              isLearnedReward: true,
              projectData: expect.objectContaining({ isCompleted: true }),
            }),
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
        stashedType: "weapon",
        stashedSystem: { original: true },
        stashedActivities: { act3: {} },
        target: 10,
        progress: 10,
        isCompleted: false,
        tutelageId: "tier1",
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
            }),
          }),
          "system.activities.-=act1": null,
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
        progress: 9,
        target: 10,
        tutelageId: "tier1",
        isCompleted: false,
        stashedEffects: [],
        stashedActivities: {},
        stashedType: "weapon",
      };

      const item = new Item() as any;
      item.actor = actor;
      item.type = "feat";
      item.getFlag = vi.fn().mockImplementation((_scope, key) => {
        if (key === "isLearningProject") return true;
        if (key === "projectData") return { ...projectData };
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
      item.getFlag = vi.fn().mockReturnValue({ target: 10, progress: 0, tutelageId: "tier1" });

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
        tutelageId: "tier1",
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

    it("should fail and not deduct time if no tutelage tier is selected", async () => {
      const actor = new Actor() as any;
      actor.flags = { "thefehrs-learning-manager": { bank: { total: 100 } } };

      const item = new Item() as any;
      item.actor = actor;
      item.getFlag = vi.fn().mockReturnValue({ target: 10, progress: 0, tutelageId: "" });

      const activity = {
        item,
        flags: { "thefehrs-learning-manager": { timeUnitId: "hour" } },
      };

      const result = await ProjectEngine.processTraining(activity as any);

      expect(result).toBe(false);
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        "Please select a tutelage tier for this project.",
      );
      expect(actor.setFlag).not.toHaveBeenCalledWith(
        "thefehrs-learning-manager",
        "bank",
        expect.any(Object),
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
        tutelageId: "tier1",
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
      expect(data).toHaveLength(3);
      const spendAllActivity = data.find((a) => a.flags["thefehrs-learning-manager"]?.isSpendAll);
      expect(spendAllActivity).toBeDefined();
      expect(spendAllActivity?.name).toBe("Spend all time");
    });
  });

  describe("signalTimeDistribution", () => {
    it("should emit timeGrantedSignal via Socket", () => {
      const emitSpy = vi.spyOn(Socket, "emitSignal").mockImplementation(() => {});

      ProjectEngine.signalTimeDistribution();

      expect(emitSpy).toHaveBeenCalledWith("timeGrantedSignal");
    });
  });

  describe("processSpendAll", () => {
    it("should ask for confirmation when manual", async () => {
      const item = new Item() as any;
      const actor = new Actor() as any;
      item.actor = actor;
      item.system = {
        activities: [
          {
            flags: {
              "thefehrs-learning-manager": {
                isLearningActivity: true,
                timeUnitId: "hour",
              },
            },
          },
        ],
      };

      const mockProxy = { bank: { total: 10 } };
      vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);
      vi.spyOn(Settings, "timeUnits", "get").mockReturnValue([
        { id: "hour", name: "Hour", ratio: 1 } as any,
      ]);

      const confirmSpy = vi
        .mocked(foundry.applications.api.DialogV2.confirm)
        .mockResolvedValue(false);

      const result = await ProjectEngine.processSpendAll(item);

      expect(confirmSpy).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it("should iterate and call processTraining for fitting activities", async () => {
      const actor = new Actor() as any;
      const item = new Item() as any;
      item.id = "proj1";
      item.actor = actor;
      item.system = {
        activities: [
          {
            flags: {
              "thefehrs-learning-manager": { isLearningActivity: true, timeUnitId: "hour" },
            },
          },
        ],
      };

      const mockProxy = { bank: { total: 2 } };
      vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);
      vi.mocked(foundry.applications.api.DialogV2.confirm).mockResolvedValue(true);

      const processSpy = vi.spyOn(ProjectEngine, "processTraining").mockImplementation(async () => {
        mockProxy.bank.total -= 1;
        return true;
      });

      actor.items = {
        get: vi.fn().mockReturnValue(item),
      };
      item.getFlag = vi.fn().mockReturnValue({ isCompleted: false });

      const result = await ProjectEngine.processSpendAll(item);

      expect(result).toBe(true);
      expect(processSpy).toHaveBeenCalledTimes(2);
      expect(processSpy).toHaveBeenCalledWith(
        item.system.activities[0],
        expect.objectContaining({ skipPrompt: true }),
      );
      expect(mockProxy.bank.total).toBe(0);
    });
  });

  describe("handleAutoTrainSignal", () => {
    let mockActor: any;
    let mockUser: any;

    beforeEach(() => {
      mockActor = {
        items: {
          filter: vi.fn(),
        },
      };
      mockUser = {
        isGM: false,
        character: mockActor,
      };
      global.game.user = mockUser;
      global.ui = { notifications: { warn: vi.fn() } } as any;

      vi.spyOn(Settings, "get").mockImplementation((key) => {
        if (key === "autoSpend") return true;
        if (key === "autoSpendUnits") return ["hour", "day", "week"];
        return null;
      });
    });

    it("should do nothing if autoSpend is disabled", async () => {
      vi.spyOn(Settings, "get").mockImplementation((key) => {
        if (key === "autoSpend") return false;
        if (key === "autoSpendUnits") return ["hour", "day", "week"];
        return null;
      });
      const filterSpy = mockActor.items.filter;

      await ProjectEngine.handleAutoTrainSignal();

      expect(filterSpy).not.toHaveBeenCalled();
    });

    it("should do nothing if user is GM", async () => {
      mockUser.isGM = true;
      const filterSpy = mockActor.items.filter;

      await ProjectEngine.handleAutoTrainSignal();

      expect(filterSpy).not.toHaveBeenCalled();
    });

    it("should call processSpendAll if exactly one project is found", async () => {
      const mockProject = { id: "proj1" };
      mockActor.items.filter.mockReturnValue([mockProject]);
      const spendAllSpy = vi.spyOn(ProjectEngine, "processSpendAll").mockResolvedValue(true);

      await ProjectEngine.handleAutoTrainSignal();

      expect(spendAllSpy).toHaveBeenCalledWith(mockProject, ["hour", "day", "week"]);
    });

    it("should warn if more than one project is found and autoSpend is true", async () => {
      mockActor.items.filter.mockReturnValue([{}, {}]);
      const spendAllSpy = vi.spyOn(ProjectEngine, "processSpendAll");

      await ProjectEngine.handleAutoTrainSignal();

      expect(spendAllSpy).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        expect.stringContaining("more than one active project"),
      );
    });

    it("should do nothing if no project is found", async () => {
      mockActor.items.filter.mockReturnValue([]);
      const spendAllSpy = vi.spyOn(ProjectEngine, "processSpendAll");

      await ProjectEngine.handleAutoTrainSignal();

      expect(spendAllSpy).not.toHaveBeenCalled();
      expect(ui.notifications.warn).not.toHaveBeenCalled();
    });
  });
});
