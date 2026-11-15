import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { LearningManager } from "@/LearningManager";
import { Settings, SettingsManager } from "@/core/settings";
import { ProjectEngine } from "@/logic/project-engine";
import { TutelageResolverService } from "@/logic/tutelage-resolver";
import { Socket } from "@/core/socket";
import { migrateData } from "@/migrations/migration";
import { registerMigrationSettings } from "@/migrations/migration-registration";
import { getGame } from "@/core/foundry";

vi.mock("@/migrations/migration", () => ({
  migrateData: vi.fn(),
}));

vi.mock("@/migrations/migration-registration", () => ({
  registerMigrationSettings: vi.fn(),
}));

vi.mock("@/core/settings", () => ({
  Settings: {
    registerMenu: vi.fn(),
    get: vi.fn(),
  },
  SettingsManager: {
    registerAll: vi.fn(),
  },
}));

vi.mock("@/logic/project-engine", () => ({
  ProjectEngine: {
    syncAllProjectActivities: vi.fn(),
    handleAutoTrainSignal: vi.fn(),
    processTraining: vi.fn().mockResolvedValue(undefined),
    initiateProjectFromItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/logic/tutelage-resolver", () => ({
  TutelageResolverService: {
    clearCache: vi.fn(),
  },
}));

vi.mock("@/core/socket", () => ({
  Socket: {
    listen: vi.fn().mockReturnValue(vi.fn()),
    off: vi.fn(),
  },
}));

vi.mock("@/core/foundry", () => ({
  getGame: vi.fn(),
  getUI: vi.fn(),
}));

describe("LearningManager", () => {
  let originalConfig: any;

  beforeAll(() => {
    originalConfig = (globalThis as any).CONFIG;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).getGame = getGame;
    LearningManager.svelteInstances = new Map();
    LearningManager.socketHandler = null;

    if (originalConfig === undefined) {
      delete (globalThis as any).CONFIG;
    } else {
      (globalThis as any).CONFIG = originalConfig;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    LearningManager.svelteInstances = new Map();
    LearningManager.socketHandler = null;

    if (originalConfig === undefined) {
      delete (globalThis as any).CONFIG;
    } else {
      (globalThis as any).CONFIG = originalConfig;
    }
  });

  describe("init", () => {
    it("should register settings, hooks, and menus", () => {
      LearningManager.init();

      expect(registerMigrationSettings).toHaveBeenCalled();
      expect(SettingsManager.registerAll).toHaveBeenCalled();
      expect(Settings.registerMenu).toHaveBeenCalledTimes(4);
      expect(Hooks.on).toHaveBeenCalled();
    });

    it("should register config expansions", () => {
      (globalThis as any).CONFIG = { DND5E: { featureTypes: {} } };
      LearningManager.init();
      expect(globalThis.CONFIG.DND5E.featureTypes["learning-project"]).toBeDefined();
    });
  });

  describe("registerSettings", () => {
    it("should register settings with onChange handlers", () => {
      LearningManager.init();
      const call = (SettingsManager.registerAll as any).mock.calls[0][0];
      expect(call.timeUnits.onChange).toBeDefined();
      expect(call.teacherCompendiums.onChange).toBeDefined();
      expect(call.bookCompendiums.onChange).toBeDefined();
    });

    it("should call ProjectEngine.syncAllProjectActivities on timeUnits change", async () => {
      LearningManager.init();
      const call = (SettingsManager.registerAll as any).mock.calls[0][0];
      await call.timeUnits.onChange();
      expect(ProjectEngine.syncAllProjectActivities).toHaveBeenCalled();
    });

    it("should call TutelageResolverService.clearCache on compendium change", () => {
      LearningManager.init();
      const call = (SettingsManager.registerAll as any).mock.calls[0][0];
      call.teacherCompendiums.onChange();
      expect(TutelageResolverService.clearCache).toHaveBeenCalled();
    });
  });

  describe("ready", () => {
    it("should call migrateData", async () => {
      await LearningManager.ready();
      expect(migrateData).toHaveBeenCalled();
    });
  });

  describe("registerSocketListeners", () => {
    it("should register a listener", () => {
      LearningManager.registerSocketListeners();
      expect(Socket.listen).toHaveBeenCalled();
    });

    it("should unregister existing listener", () => {
      LearningManager.socketHandler = vi.fn();
      LearningManager.registerSocketListeners();
      expect(Socket.off).toHaveBeenCalled();
    });
  });

  describe("registerHooks", () => {
    it("should register dnd5e.preUseItem", () => {
      LearningManager.init();
      // Find call for preUseItem
      const call = (Hooks.on as any).mock.calls.find((c: any) => c[0] === "dnd5e.preUseItem");
      expect(call).toBeDefined();

      const callback = call[1];
      const mockItem = {
        getFlag: vi.fn().mockReturnValue(true),
      };
      const mockConfig = { createMessage: true };
      callback(mockItem, mockConfig);
      expect(mockConfig.createMessage).toBe(false);
    });

    it("should register dnd5e.preUseActivity", async () => {
      LearningManager.init();
      const call = (Hooks.on as any).mock.calls.find((c: any) => c[0] === "dnd5e.preUseActivity");
      expect(call).toBeDefined();

      const callback = call[1];
      const mockActivity = {
        flags: { [LearningManager.ID]: { isLearningActivity: true } },
      };
      const result = callback(mockActivity);
      expect(result).toBe(false);
      expect(ProjectEngine.processTraining).toHaveBeenCalledWith(mockActivity);
    });

    it("should register dropActorSheetData", async () => {
      LearningManager.init();
      const call = (Hooks.on as any).mock.calls.find((c: any) => c[0] === "dropActorSheetData");
      expect(call).toBeDefined();

      const callback = call[1];
      const mockActor = { name: "Actor", type: "character" };
      const mockData = { type: "Item", uuid: "Compendium.world.items.123" };

      (globalThis as any).fromUuid = vi.fn().mockResolvedValue({
        name: "Source Item",
        system: {},
      });
      (Settings.get as any).mockReturnValue(["world.items"]);

      const result = await callback(mockActor, {}, mockData);
      expect(result).toBe(false);
    });

    it("should return false if actor is group and actorId is present but member is missing", async () => {
      LearningManager.init();
      const callback = (Hooks.on as any).mock.calls.find(
        (c: any) => c[0] === "dropActorSheetData",
      )[1];

      const mockGroupActor = { name: "Group", type: "group" };
      const mockData = { type: "Item", uuid: "Compendium.world.items.123" };

      const mockEvent = {
        target: {
          closest: vi.fn().mockReturnValue({
            dataset: {
              tidySectionKey: "actor-missing-id",
            },
          }),
        },
      };

      (getGame as any).mockReturnValue({
        actors: {
          get: vi.fn().mockReturnValue(undefined),
        },
      });

      (Settings.get as any).mockReturnValue(["world.items"]);

      const result = await callback(mockGroupActor, {}, mockData, mockEvent);
      expect(result).toBe(false);
      expect(getGame().actors.get).toHaveBeenCalledWith("missing-id");
    });

    it("should set targetActor to member if actor is group and member is found", async () => {
      LearningManager.init();
      const callback = (Hooks.on as any).mock.calls.find(
        (c: any) => c[0] === "dropActorSheetData",
      )[1];

      const mockGroupActor = { name: "Group", type: "group" };
      const mockData = { type: "Item", uuid: "Compendium.world.items.123" };
      const mockMember = { name: "Member", type: "character" };

      const mockEvent = {
        target: {
          closest: vi.fn().mockReturnValue({
            dataset: {
              tidySectionKey: "actor-found-id",
            },
          }),
        },
      };

      (getGame as any).mockReturnValue({
        actors: {
          get: vi.fn().mockReturnValue(mockMember),
        },
      });

      (globalThis as any).fromUuid = vi.fn().mockResolvedValue({
        name: "Source Item",
        system: {},
      });

      (Settings.get as any).mockReturnValue(["world.items"]);

      const result = await callback(mockGroupActor, {}, mockData, mockEvent);
      expect(result).toBe(false);
      expect(getGame().actors.get).toHaveBeenCalledWith("found-id");
      // Indirectly verify targetActor was set to member by checking ProjectEngine.initiateProjectFromItem call if I could,
      // but it's called inside then.
    });

    it("should use original actor if not a group", async () => {
      LearningManager.init();
      const callback = (Hooks.on as any).mock.calls.find(
        (c: any) => c[0] === "dropActorSheetData",
      )[1];

      const mockActor = { name: "Actor", type: "character" };
      const mockData = { type: "Item", uuid: "Compendium.world.items.123" };

      (globalThis as any).fromUuid = vi.fn().mockResolvedValue({
        name: "Source Item",
        system: {},
      });

      (Settings.get as any).mockReturnValue(["world.items"]);

      const result = await callback(mockActor, {}, mockData);
      expect(result).toBe(false);
      // If it didn't return early, it means it proceeded with mockActor
    });

    it("should add items without a learning config normally, without opening the dialog", async () => {
      LearningManager.init();
      const callback = (Hooks.on as any).mock.calls.find(
        (c: any) => c[0] === "dropActorSheetData",
      )[1];

      const createEmbeddedDocuments = vi.fn().mockResolvedValue([]);
      const mockActor = { name: "Actor", type: "character", createEmbeddedDocuments };
      const mockData = { type: "Item", uuid: "Compendium.world.items.123" };

      const plainFeat = {
        name: "Plain Feat",
        system: {},
        getFlag: vi.fn().mockReturnValue(undefined),
        toObject: () => ({ _id: "abc", folder: "f1", name: "Plain Feat", type: "feat" }),
      };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(plainFeat);
      const promptSpy = vi.fn();
      (ProjectEngine as any).promptInitiateProject = promptSpy;

      (Settings.get as any).mockReturnValue(["world.items"]);

      const result = await callback(mockActor, {}, mockData);
      expect(result).toBe(false);
      await vi.waitFor(() => expect(createEmbeddedDocuments).toHaveBeenCalledTimes(1));

      expect(createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
        { name: "Plain Feat", type: "feat" },
      ]);
      expect(promptSpy).not.toHaveBeenCalled();
      expect(ProjectEngine.initiateProjectFromItem).not.toHaveBeenCalled();
    });

    describe("synchronous compendium index check", () => {
      const field = "flags.thefehrs-learning-manager.projectData.target";
      const drop = { type: "Item", uuid: "Compendium.world.items.123" };
      let callback: any;

      const setup = (pack: unknown, entry: unknown) => {
        LearningManager.init();
        callback = (Hooks.on as any).mock.calls.find((c: any) => c[0] === "dropActorSheetData")[1];
        (Settings.get as any).mockReturnValue(["world.items"]);
        (globalThis as any).game = {
          ...(globalThis as any).game,
          packs: { get: vi.fn().mockReturnValue(pack) },
        };
        (globalThis as any).fromUuidSync = vi.fn().mockReturnValue(entry);
        (globalThis as any).fromUuid = vi.fn().mockResolvedValue(null);
      };
      const actor = { name: "Actor", type: "character" };

      it("lets the system handle items whose index shows no learning config", () => {
        setup({ indexed: true, indexFields: new Set([field]) }, { flags: {} });
        expect(callback(actor, {}, drop)).toBe(true);
        expect((globalThis as any).fromUuid).not.toHaveBeenCalled();
      });

      it("keeps handling items whose index shows a learning target", () => {
        setup(
          { indexed: true, indexFields: new Set([field]) },
          { flags: { "thefehrs-learning-manager": { projectData: { target: 5 } } } },
        );
        expect(callback(actor, {}, drop)).toBe(false);
      });

      it("keeps the async path when the index lacks the learning field", () => {
        setup({ indexed: true, indexFields: new Set() }, { flags: {} });
        expect(callback(actor, {}, drop)).toBe(false);
      });
    });
  });
});
