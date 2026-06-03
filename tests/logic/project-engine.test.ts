import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectEngine } from "../../src/logic/project-engine";
import { Settings } from "../../src/core/settings";
import { TabLogic } from "../../src/logic/tab-logic";
import { Socket } from "../../src/core/socket";
import { ActorProxy } from "../../src/logic/actor-proxy";
import { MODULE_ID } from "../../src/global";

vi.mock("@/logic/tab-logic", () => ({
  TabLogic: {
    computeProgress: vi.fn().mockResolvedValue({ progressGained: 1 }),
    deductCurrency: vi.fn().mockResolvedValue(true),
    formatCurrency: vi.fn().mockReturnValue("1gp"),
    formatTimeBank: vi.fn().mockReturnValue("1h"),
    meetsRequirements: vi.fn().mockReturnValue({ eligible: true, reason: "" }),
    calculateExpectedProgress: vi.fn().mockResolvedValue(1),
    calculateSuccessProbability: vi.fn().mockResolvedValue(0.5),
  },
}));

vi.mock("@/logic/tutelage-resolver", () => ({
  TutelageResolverService: {
    getAvailableInstructors: vi.fn().mockResolvedValue([]),
    getAvailableBooks: vi.fn().mockReturnValue([]),
    resolveTutelage: vi.fn().mockResolvedValue({
      modifier: 0,
      costs: {},
      instructorName: "None",
    }),
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
      costs: { gp: 100 },
      progress: { gp: 10 },
    },
  ];

  const mockSettingsGet =
    (overrides: Record<string, any> = {}) =>
    (key: string) => {
      if (key in overrides) return overrides[key];
      if (key === "timeUnits") return timeUnits;
      if (key === "guidanceTiers") return guidanceTiers;
      if (key === "rules") return { method: "direct" } as any;
      if (key === "teacherCompendiums") return ["world.teachers"];
      if (key === "bookCompendiums") return ["world.books"];
      return null;
    };

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).ui = {
      notifications: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    globalThis.Item = class {
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
      if (key === "guidanceTiers") return guidanceTiers;
      if (key === "rules") return { method: "direct" } as any;
      if (key === "teacherCompendiums") return ["world.teachers"];
      if (key === "bookCompendiums") return ["world.books"];
      return null;
    });

    globalThis.game = {
      settings: {
        get: vi.fn().mockImplementation((_scope, key) => {
          if (key === "timeUnits") return timeUnits;
          if (key === "guidanceTiers") return guidanceTiers;
          if (key === "rules") return { method: "direct" };
          if (key === "teacherCompendiums") return ["world.teachers"];
          if (key === "bookCompendiums") return ["world.books"];
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
        if (key === "projectData") return { target: 10, requirements: [], tutelageId: "" };
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

      const result = await ProjectEngine.initiateProjectFromItem(actor, rewardItem);

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
                  tutelageId: "",
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

      const result = await ProjectEngine.initiateProjectFromItem(actor, rewardItem);

      expect(result).toBeNull();
      expect(ui.notifications.error).toHaveBeenCalledWith(
        expect.stringContaining("Cannot create project"),
      );
    });
  });

  describe("injectActivities", () => {
    it("should add training activities to the item", async () => {
      const item = new Item() as any;
      item.getFlag.mockImplementation((scope: string, key: string) => {
        if (key === "projectData") return { target: 10, tutelageId: "" };
        return null;
      });

      vi.mocked(Settings.get).mockImplementation((key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "rules") return { method: "direct" } as any;
        if (key === "teacherCompendiums") return ["world.teachers"];
        if (key === "bookCompendiums") return ["world.books"];
        return null;
      });

      await ProjectEngine.injectActivities(item);

      expect(item.update).toHaveBeenCalledWith(
        expect.objectContaining({
          "system.activities": expect.any(Object),
        }),
        { render: false },
      );
    });

    it("should skip injection if target is 0", async () => {
      const item = new Item() as any;
      item.getFlag.mockImplementation((scope: string, key: string) => {
        if (key === "projectData") return { target: 0, tutelageId: "" };
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
        tutelageId: "",
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

      globalThis.fromUuid = vi.fn().mockResolvedValue(sourceItem);

      await ProjectEngine.completeProject(item);

      expect(globalThis.fromUuid).toHaveBeenCalledWith("Compendium.some.uuid");
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

    it("should fallback to recreation restore if source is not found", async () => {
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
        tutelageId: "",
      };

      const item = new Item() as any;
      item.actor = actor;
      item.name = "Learning Project";
      item.type = "weapon";
      item.delete = vi.fn().mockResolvedValue(true);
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

      globalThis.fromUuid = vi.fn().mockRejectedValue(new Error("Not found"));

      await ProjectEngine.completeProject(item);

      // Should have been recreated
      expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith(
        "Item",
        expect.arrayContaining([
          expect.objectContaining({
            name: "Stashed Name",
            type: "weapon",
            system: expect.objectContaining({
              original: true,
              activities: { act3: {} },
            }),
          }),
        ]),
      );
      expect(item.delete).toHaveBeenCalled();
    });

    it("should recreate the item if type change is needed during restoration", async () => {
      const actor = new Actor() as any;
      actor.createEmbeddedDocuments = vi.fn().mockResolvedValue([new Item()]);

      const projectDataFlags = {
        stashedType: "weapon", // Original was weapon, current is feat
        stashedName: "Weapon",
        stashedSystem: { original: true },
        tutelageId: "",
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

      globalThis.fromUuid = vi.fn().mockRejectedValue(new Error("Not found"));

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
      actor.system.currency = { gp: 10, sp: 0, cp: 0 };

      const projectData = {
        progress: 9,
        target: 10,
        tutelageId: "",
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
        if (key === "teacherCompendiums") return ["world.teachers"];
        if (key === "bookCompendiums") return ["world.books"];
        if (key === "rules") return { method: "direct" } as any;
        return null;
      });

      const result = await ProjectEngine.processTraining(activity as any, { skipPrompt: true });

      expect(result).toBe(true);
      // Check for completion recreation
      expect(actor.createEmbeddedDocuments).toHaveBeenCalled();

      const createdItem = vi
        .mocked(actor.createEmbeddedDocuments)
        .mock.calls.find((c) => c[1][0].flags?.[Settings.ID]?.isLearnedReward)![1][0];

      expect(createdItem.flags[Settings.ID]).toEqual(
        expect.objectContaining({
          isLearnedReward: true,
        }),
      );
      // system.description.value should be updated (now in nested system object)
      expect(createdItem.system.description.value).toBeDefined();
      expect(item.delete).toHaveBeenCalled();

      expect(actor.setFlag).toHaveBeenCalledWith(
        MODULE_ID,
        "bank",
        expect.objectContaining({ total: 99 }),
      );
    });

    it("should handle excess progress and initiate follow-up project", async () => {
      const actor = new Actor() as any;
      actor.name = "Actor";
      actor.system.currency = { gp: 10, sp: 0, cp: 0 };
      actor.system.abilities = { int: { mod: 0 } };
      actor.getFlag.mockReturnValue({ total: 100 }); // bank
      actor.getRollData = vi.fn().mockReturnValue({});

      const projectData = {
        progress: 9,
        target: 10,
        tutelageId: "",
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

      const followUpItem = new Item() as any;
      followUpItem.name = "Second Project";
      followUpItem.getFlag.mockReturnValue({ requirements: [] });
      globalThis.fromUuid = vi.fn().mockResolvedValue(followUpItem);

      vi.mocked(TabLogic.meetsRequirements).mockReturnValue({ eligible: true, reason: "" });
      vi.mocked(foundry.applications.api.DialogV2.confirm).mockResolvedValue(true);
      vi.spyOn(ProjectEngine, "completeProject").mockResolvedValue(undefined);
      const initiateSpy = vi.spyOn(ProjectEngine, "initiateProjectFromItem").mockResolvedValue({
        getFlag: vi.fn().mockReturnValue({ target: 10, progress: 0 }),
        update: vi.fn().mockResolvedValue(true),
      } as any);

      const activity = { item, flags: { [MODULE_ID]: { timeUnitId: "hour" } } };
      vi.mocked(TabLogic.computeProgress).mockResolvedValue({ progressGained: 5 }); // 4 excess

      await ProjectEngine.processTraining(activity as any, { skipPrompt: true });

      expect(initiateSpy).toHaveBeenCalledWith(actor, followUpItem);
    });

    it("should whisper the roll to the player and GM", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        [MODULE_ID]: {
          bank: { total: 100 },
        },
      };
      actor.system.currency = { gp: 10, sp: 0, cp: 0 };

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

      await ProjectEngine.processTraining(activity as any, { skipPrompt: true });

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
      actor.system.currency = { gp: 10, sp: 0, cp: 0 };

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
          [MODULE_ID]: {
            timeUnitId: "hour",
          },
        },
      };

      vi.mocked(TabLogic.computeProgress).mockResolvedValueOnce({
        progressGained: 0,
        reason: "Mock failure reason",
      });

      await ProjectEngine.processTraining(activity as any, { skipPrompt: true });

      expect(ui.notifications.info).toHaveBeenCalledWith(
        "Training unsuccessful: Mock failure reason",
      );
    });

    it("should not duplicate progress indicators in name and description", async () => {
      const actor = new Actor() as any;
      actor.flags = { [MODULE_ID]: { bank: { total: 100 } } };
      actor.system.currency = { gp: 10, sp: 0, cp: 0 };

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
        flags: { [MODULE_ID]: { timeUnitId: "hour" } },
      };

      vi.mocked(TabLogic.computeProgress).mockResolvedValueOnce({ progressGained: 1 });
      vi.mocked(Settings.get).mockImplementation((key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "teacherCompendiums") return ["world.teachers"];
        if (key === "bookCompendiums") return ["world.books"];
        if (key === "rules") return { method: "direct" } as any;
        return null;
      });

      await ProjectEngine.processTraining(activity as any, { skipPrompt: true });

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

    it("should abort if the chosen bulk method is unavailable", async () => {
      const actor = new Actor() as any;
      actor.flags = { [MODULE_ID]: { bank: { total: 100 } } };
      actor.system.currency = { gp: 10, sp: 0, cp: 0 };
      actor.getRollData = vi.fn().mockReturnValue({});

      const item = new Item() as any;
      item.actor = actor;
      item.getFlag = vi.fn().mockReturnValue({ target: 10, progress: 0, tutelageId: "tier1" });

      const activity = {
        item,
        flags: { [MODULE_ID]: { timeUnitId: "day" } }, // day is bulk
      };

      vi.mocked(Settings.get).mockImplementation(
        mockSettingsGet({
          rules: {
            bulkMethod: "roll",
            nonBulkMethod: "direct",
            checkFormula: "1d20",
            checkDC: 10,
          },
        }),
      );

      vi.mocked(TabLogic.calculateExpectedProgress).mockResolvedValue(NaN);

      // Simulate user clicking "bulk" in the resolution dialog
      vi.spyOn(foundry.applications.api.DialogV2.prototype, "render").mockImplementation(
        async function (this: any) {
          this._data?.buttons?.find((b: any) => b.action === "bulk")?.callback?.();
          return this;
        },
      );

      const result = await ProjectEngine.processTraining(activity as any);

      expect(result).toBe(false);
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        expect.stringContaining("chosen bulk training path is unavailable"),
      );
      expect(TabLogic.deductCurrency).not.toHaveBeenCalled();
    });

    it("should abort if the chosen separate method is unavailable", async () => {
      const actor = new Actor() as any;
      actor.flags = { [MODULE_ID]: { bank: { total: 100 } } };
      actor.system.currency = { gp: 10, sp: 0, cp: 0 };
      actor.getRollData = vi.fn().mockReturnValue({});

      const item = new Item() as any;
      item.actor = actor;
      item.getFlag = vi.fn().mockReturnValue({ target: 10, progress: 0, tutelageId: "tier1" });

      const activity = {
        item,
        flags: { [MODULE_ID]: { timeUnitId: "day" } }, // day is bulk
      };

      vi.mocked(Settings.get).mockImplementation(
        mockSettingsGet({
          rules: {
            bulkMethod: "direct",
            nonBulkMethod: "roll",
            checkFormula: "1d20",
            checkDC: 10,
          },
        }),
      );

      vi.mocked(TabLogic.calculateExpectedProgress).mockResolvedValue(NaN);

      // Simulate user clicking "separate" in the resolution dialog
      vi.spyOn(foundry.applications.api.DialogV2.prototype, "render").mockImplementation(
        async function (this: any) {
          this._data?.buttons?.find((b: any) => b.action === "separate")?.callback?.();
          return this;
        },
      );

      const result = await ProjectEngine.processTraining(activity as any);

      expect(result).toBe(false);
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        expect.stringContaining("chosen separate training path is unavailable"),
      );
      expect(TabLogic.deductCurrency).not.toHaveBeenCalled();
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
        if (key === "teacherCompendiums") return ["world.teachers"];
        if (key === "bookCompendiums") return ["world.books"];
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

    it("should iterate and call executeTrainingIteration and applyTrainingResult", async () => {
      const actor = new Actor() as any;
      const item = new Item() as any;
      item.id = "proj1";
      item.actor = actor;
      item.system = {
        activities: [
          {
            id: "act1",
            item: item,
            flags: {
              [MODULE_ID]: { isLearningActivity: true, timeUnitId: "hour" },
            },
          },
        ],
      };

      const mockProxy = { bank: { total: 2 }, currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } };
      vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);
      vi.mocked(foundry.applications.api.DialogV2.confirm).mockResolvedValue(true);

      const executeSpy = vi
        .spyOn(ProjectEngine, "executeTrainingIteration")
        .mockImplementation(async (_act, opts) => {
          const state = opts?.currentState;
          if (!state) throw new Error("Mock executeTrainingIteration: currentState is missing");
          state.bankTotal -= 1;
          state.projectData.progress += 1;
          return {
            progressGained: 1,
            excessProgress: 0,
            costCp: 0,
            timeSpent: 1,
            rolls: [],
            reasons: [],
            instructorName: "Self-Study",
            newState: state,
          };
        });
      const applySpy = vi.spyOn(ProjectEngine, "applyTrainingResult").mockResolvedValue(true);

      actor.items = {
        get: vi.fn().mockReturnValue(item),
      };
      item.getFlag = vi.fn().mockReturnValue({ progress: 0, target: 100, isCompleted: false });

      const result = await ProjectEngine.processSpendAll(item);

      expect(result).toBe(true);
      expect(executeSpy).toHaveBeenCalledTimes(2);
      expect(applySpy).toHaveBeenCalledTimes(1);
      expect(mockProxy.bank.total).toBe(2); // Local aggregation doesn't update original proxy until apply
    });

    it("should handle failures in the loop and continue", async () => {
      const actor = new Actor() as any;
      const item = new Item() as any;
      item.id = "proj1";
      item.actor = actor;
      item.system = {
        activities: [
          {
            id: "act1",
            item: item,
            flags: {
              [MODULE_ID]: { isLearningActivity: true, timeUnitId: "hour" },
            },
          },
        ],
      };
      const mockProxy = { bank: { total: 2 }, currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } };
      vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);
      vi.mocked(foundry.applications.api.DialogV2.confirm).mockResolvedValue(true);

      let calls = 0;
      const _executeSpy = vi
        .spyOn(ProjectEngine, "executeTrainingIteration")
        .mockImplementation(async (_act, opts) => {
          calls++;
          if (calls === 1) return null; // Fail first call
          const state = opts?.currentState;
          if (!state) throw new Error("Mock executeTrainingIteration: currentState is missing");
          state.bankTotal -= 1;
          return {
            progressGained: 1,
            excessProgress: 0,
            costCp: 0,
            timeSpent: 1,
            rolls: [],
            reasons: [],
            instructorName: "Self-Study",
            newState: state,
          };
        });

      actor.items = { get: vi.fn().mockReturnValue(item) };
      item.getFlag = vi.fn().mockReturnValue({ progress: 0, target: 100, isCompleted: false });

      await ProjectEngine.processSpendAll(item);
      expect(calls).toBe(1); // It now breaks on first failure
    });

    it("should forward excessProgress from a completing iteration to applyTrainingResult", async () => {
      const actor = new Actor() as any;
      const item = new Item() as any;
      item.id = "proj1";
      item.actor = actor;
      item.system = {
        activities: [
          {
            id: "act1",
            item: item,
            flags: { [MODULE_ID]: { isLearningActivity: true, timeUnitId: "hour" } },
          },
        ],
      };

      const mockProxy = { bank: { total: 3 }, currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } };
      vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);
      vi.mocked(foundry.applications.api.DialogV2.confirm).mockResolvedValue(true);

      let calls = 0;
      vi.spyOn(ProjectEngine, "executeTrainingIteration").mockImplementation(async (_act, opts) => {
        calls++;
        const state = opts?.currentState;
        if (!state) throw new Error("currentState missing");
        state.bankTotal -= 1;
        if (calls === 1) {
          state.projectData.progress = 1;
          return {
            progressGained: 1,
            excessProgress: 0,
            costCp: 0,
            timeSpent: 1,
            rolls: [],
            reasons: [],
            instructorName: "Self-Study",
            newState: state,
          };
        }
        // Second iteration: overshoots target by 3
        state.projectData.progress = 2;
        state.projectData.isCompleted = true;
        return {
          progressGained: 5,
          excessProgress: 3,
          costCp: 0,
          timeSpent: 1,
          rolls: [],
          reasons: [],
          instructorName: "Self-Study",
          newState: state,
        };
      });

      const applySpy = vi.spyOn(ProjectEngine, "applyTrainingResult").mockResolvedValue(true);
      item.getFlag = vi.fn().mockReturnValue({ progress: 0, target: 2, isCompleted: false });

      await ProjectEngine.processSpendAll(item);

      expect(applySpy).toHaveBeenCalledTimes(1);
      expect(applySpy.mock.calls[0][2]).toMatchObject({ excessProgress: 3 });
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
      globalThis.game.user = mockUser;

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
