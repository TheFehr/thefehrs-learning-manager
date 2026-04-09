import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectEngine } from "../src/logic/project-engine";
import { Settings } from "../src/core/settings";
import { TabLogic } from "../src/logic/tab-logic";
import { Socket } from "../src/core/socket";
import { ActorProxy } from "../src/logic/actor-proxy";
import { MODULE_ID } from "../src/global";

vi.mock("../src/logic/tab-logic", () => ({
  TabLogic: {
    computeProgress: vi.fn().mockResolvedValue({ progressGained: 1 }),
    deductCurrency: vi.fn().mockResolvedValue(true),
    formatCurrency: vi.fn().mockReturnValue("1gp"),
    formatTimeBank: vi.fn().mockReturnValue("1h"),
    meetsRequirements: vi.fn().mockReturnValue({ eligible: true, reason: "" }),
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
    (global as any).ui = {
      notifications: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    global.Item = class {
      constructor() {}
      update = vi.fn().mockResolvedValue(this);
      delete = vi.fn().mockResolvedValue(true);
      createEmbeddedDocuments = vi.fn().mockResolvedValue([]);
      getFlag = vi.fn();
      setFlag = vi.fn();
      name = "Mock Item";
      toObject = vi.fn().mockReturnValue({ system: { activities: {} } });
      system = { activities: {} };
    } as any;

    // Default mocks that can be overridden in specific tests
    vi.spyOn(Settings, "get").mockImplementation((key) => {
      if (key === "timeUnits") return timeUnits;
      if (key === "rules") return { method: "direct" } as any;
      if (key === "guidanceTiers") return guidanceTiers;
      return null;
    });

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
              [MODULE_ID]: expect.objectContaining({
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

    it("should return null if target is missing or 0", async () => {
      const actor = new Actor() as any;
      const rewardItem = new Item() as any;
      rewardItem.name = "Invalid Reward";
      rewardItem.getFlag.mockReturnValue({ target: 0 }); // Invalid target
      vi.spyOn(ui.notifications, "error");

      const result = await ProjectEngine.initiateProjectFromItem(actor, rewardItem, "tier1");

      expect(result).toBeNull();
      expect(ui.notifications.error).toHaveBeenCalledWith(
        expect.stringContaining("Invalid target value"),
      );
    });
  });

  describe("injectActivities", () => {
    it("should add training activities to the item", async () => {
      const item = new Item() as any;
      item.getFlag.mockImplementation((scope: string, key: string) => {
        if (key === "projectData") return { target: 10, tutelageId: "tier1" };
        return null;
      });

      vi.mocked(Settings.get).mockImplementation((key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "guidanceTiers") return guidanceTiers;
        if (key === "rules") return { method: "direct" } as any;
        return null;
      });

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
            [MODULE_ID]: expect.objectContaining({
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
      item.type = "weapon";
      item.delete = vi.fn();
      const activitiesMap = new Map([
        ["act1", { id: "act1", flags: { [MODULE_ID]: { isLearningActivity: true } } }],
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

      // Should have been called once (atomic update)
      expect(item.update).toHaveBeenCalledTimes(1);

      // Call: primary update (system, name, etc., and dot-notation updates)
      expect(vi.mocked(item.update).mock.calls[0][0]).toEqual(
        expect.objectContaining({
          name: "Stashed Name",
          system: expect.objectContaining({
            original: true,
            activities: expect.objectContaining({
              act3: {},
            }),
          }),
          "flags.thefehrs-learning-manager": expect.objectContaining({
            isLearnedReward: true,
          }),
          "system.activities.-=act1": null,
        }),
      );
      expect(item.delete).not.toHaveBeenCalled();
    });

    it("should recreate the item if type change is needed during restoration", async () => {
      const actor = new Actor() as any;
      actor.createEmbeddedDocuments = vi.fn().mockResolvedValue([new Item()]);

      const projectDataFlags = {
        stashedType: "weapon", // Original was weapon, current is feat
        stashedName: "Weapon",
        stashedSystem: { original: true },
        tutelageId: "tier1",
      };

      const item = new Item() as any;
      item.actor = actor;
      item.type = "feat"; // Current type
      item.delete = vi.fn().mockResolvedValue(true);
      item.getFlag = vi.fn().mockImplementation((_scope, key) => {
        if (key === "isLearningProject") return true;
        if (key === "projectData") return projectDataFlags;
        return null;
      });

      global.fromUuid = vi.fn().mockRejectedValue(new Error("Not found"));

      await ProjectEngine.completeProject(item);

      expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
        expect.objectContaining({
          type: "weapon",
          name: "Weapon",
        }),
      ]);
      expect(item.delete).toHaveBeenCalled();
    });
  });

  describe("processTraining", () => {
    it("should progress the project and handle completion", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        [MODULE_ID]: {
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
        stashedSystem: {
          description: { value: "Original Description" },
        },
      };

      const item = new Item() as any;
      item.actor = actor;
      item.type = "weapon"; // Match stashedType to test in-place update
      item.getFlag = vi.fn().mockImplementation((_scope, key) => {
        if (key === "isLearningProject") return true;
        if (key === "projectData") return { ...projectData };
        return null;
      });
      item.name = "Learning Item";

      const activity = {
        item,
        flags: {
          [MODULE_ID]: {
            timeUnitId: "hour",
          },
        },
      };

      vi.mocked(Settings.get).mockImplementation((key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "guidanceTiers") return guidanceTiers;
        if (key === "rules") return { method: "direct" } as any;
        return null;
      });

      const result = await ProjectEngine.processTraining(activity as any);

      expect(result).toBe(true);
      // Check for completion update (atomic since Phase 1 refactor)
      expect(item.update).toHaveBeenCalled();

      const completionUpdate = vi
        .mocked(item.update)
        .mock.calls.find((c) => c[0]["flags.thefehrs-learning-manager"])![0];

      expect(completionUpdate["flags.thefehrs-learning-manager"]).toEqual(
        expect.objectContaining({
          isLearnedReward: true,
        }),
      );
      // system.description.value should be updated (now in nested system object)
      expect(completionUpdate.system.description.value).toBeDefined();

      expect(actor.setFlag).toHaveBeenCalledWith(
        MODULE_ID,
        "bank",
        expect.objectContaining({ total: 99 }),
      );
    });

    it("should handle excess progress and initiate follow-up project", async () => {
      const actor = {
        system: { currency: { gp: 10, sp: 0, cp: 0 }, abilities: { int: { mod: 0 } } },
        getFlag: vi.fn().mockReturnValue({ total: 100 }), // bank
        setFlag: vi.fn().mockResolvedValue(true),
        getRollData: vi.fn().mockReturnValue({}),
        name: "Actor",
      } as any;

      const projectData = {
        progress: 9,
        target: 10,
        tutelageId: "tier1",
        isCompleted: false,
        followUpProjectId: "Compendium.test.followup",
      };

      const item = {
        actor,
        id: "proj1",
        getFlag: vi.fn().mockReturnValue(projectData),
        name: "First Project",
        update: vi.fn().mockResolvedValue(true),
      } as any;

      const followUpItem = {
        name: "Second Project",
        getFlag: vi.fn().mockReturnValue({ requirements: [] }),
      } as any;
      global.fromUuid = vi.fn().mockResolvedValue(followUpItem);

      vi.mocked(foundry.applications.api.DialogV2.confirm).mockResolvedValue(true);
      vi.spyOn(ProjectEngine, "completeProject").mockResolvedValue(undefined);
      const initiateSpy = vi.spyOn(ProjectEngine, "initiateProjectFromItem").mockResolvedValue({
        getFlag: vi.fn().mockReturnValue({ target: 10, progress: 0 }),
        update: vi.fn().mockResolvedValue(true),
      } as any);

      const activity = { item, flags: { [MODULE_ID]: { timeUnitId: "hour" } } };
      vi.mocked(TabLogic.computeProgress).mockResolvedValue({ progressGained: 5 }); // 4 excess

      await ProjectEngine.processTraining(activity as any);

      expect(initiateSpy).toHaveBeenCalledWith(actor, followUpItem, "tier1");
    });

    it("should whisper the roll to the player and GM", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        [MODULE_ID]: {
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
          [MODULE_ID]: {
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

      vi.mocked(Settings.get).mockImplementation((key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "guidanceTiers") return guidanceTiers;
        if (key === "rules")
          return {
            method: "roll",
            rollMode: "blindroll",
            checkDC: 10,
          } as any;
        return null;
      });

      await ProjectEngine.processTraining(activity as any);

      expect(mockRoll.toMessage).toHaveBeenCalledWith(
        expect.objectContaining({ flavor: expect.any(String) }),
        expect.objectContaining({ rollMode: "blindroll" }),
      );
    });

    it("should notify user with reason on failed training", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        [MODULE_ID]: {
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
          [MODULE_ID]: {
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
      actor.flags = { [MODULE_ID]: { bank: { total: 100 } } };

      const item = new Item() as any;
      item.actor = actor;
      item.getFlag = vi.fn().mockReturnValue({ target: 10, progress: 0, tutelageId: "" });

      const activity = {
        item,
        flags: { [MODULE_ID]: { timeUnitId: "hour" } },
      };

      const result = await ProjectEngine.processTraining(activity as any);

      expect(result).toBe(false);
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        "Please select a tutelage tier for this project.",
      );
      expect(actor.setFlag).not.toHaveBeenCalledWith(MODULE_ID, "bank", expect.any(Object));
    });

    it("should not duplicate progress indicators in name and description", async () => {
      const actor = new Actor() as any;
      actor.flags = { [MODULE_ID]: { bank: { total: 100 } } };
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
        flags: { [MODULE_ID]: { timeUnitId: "hour" } },
      };

      vi.mocked(TabLogic.computeProgress).mockResolvedValueOnce({ progressGained: 1 });
      vi.mocked(Settings.get).mockImplementation((key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "guidanceTiers") return guidanceTiers;
        if (key === "rules") return { method: "direct" } as any;
        return null;
      });

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
      vi.mocked(Settings.get).mockImplementation((key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "guidanceTiers") return guidanceTiers;
        if (key === "rules") return { method: "direct" } as any;
        return null;
      });
      const data = ProjectEngine.getActivitiesData(10);
      expect(data).toHaveLength(3);
      const spendAllActivity = data.find((a) => a.flags[MODULE_ID]?.isSpendAll);
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
              [MODULE_ID]: {
                isLearningActivity: true,
                timeUnitId: "hour",
              },
            },
          },
        ],
      };

      const mockProxy = { bank: { total: 10 } };
      vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);
      vi.mocked(Settings.get).mockImplementation((key) => {
        if (key === "timeUnits") return [{ id: "hour", name: "Hour", ratio: 1 } as any];
        if (key === "guidanceTiers") return guidanceTiers;
        if (key === "rules") return { method: "direct" } as any;
        return null;
      });

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
              [MODULE_ID]: { isLearningActivity: true, timeUnitId: "hour" },
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

    it("should handle failures in the loop and continue", async () => {
      const actor = new Actor() as any;
      const item = new Item() as any;
      item.actor = actor;
      item.system = {
        activities: [
          {
            flags: {
              [MODULE_ID]: { isLearningActivity: true, timeUnitId: "hour" },
            },
          },
        ],
      };
      const mockProxy = { bank: { total: 2 } };
      vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);
      vi.mocked(foundry.applications.api.DialogV2.confirm).mockResolvedValue(true);

      let calls = 0;
      const processSpy = vi.spyOn(ProjectEngine, "processTraining").mockImplementation(async () => {
        calls++;
        if (calls === 1) return false; // Fail first call
        mockProxy.bank.total -= 1;
        return true;
      });

      actor.items = { get: vi.fn().mockReturnValue(item) };
      item.getFlag = vi.fn().mockReturnValue({ isCompleted: false });

      await ProjectEngine.processSpendAll(item);
      expect(calls).toBe(3);
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
