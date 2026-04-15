import { describe, it, expect, vi, beforeEach } from "vitest";
import { LearningManager } from "../src/LearningManager";
import { Settings, SettingsManager } from "../src/core/settings";
import { ProjectEngine } from "../src/logic/project-engine";
import { TutelageResolverService } from "../src/logic/tutelage-resolver";
import { Socket } from "../src/core/socket";
import { migrateData } from "../src/migrations/migration";
import { registerMigrationSettings } from "../src/migrations/migration-registration";

vi.mock("../src/migrations/migration", () => ({
  migrateData: vi.fn(),
}));

vi.mock("../src/migrations/migration-registration", () => ({
  registerMigrationSettings: vi.fn(),
}));

vi.mock("../src/core/settings", () => ({
  Settings: {
    registerMenu: vi.fn(),
    get: vi.fn(),
  },
  SettingsManager: {
    registerAll: vi.fn(),
  },
}));

vi.mock("../src/logic/project-engine", () => ({
  ProjectEngine: {
    syncAllProjectActivities: vi.fn(),
    handleAutoTrainSignal: vi.fn(),
    processTraining: vi.fn().mockResolvedValue(undefined),
    initiateProjectFromItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../src/logic/tutelage-resolver", () => ({
  TutelageResolverService: {
    clearCache: vi.fn(),
  },
}));

vi.mock("../src/core/socket", () => ({
  Socket: {
    listen: vi.fn().mockReturnValue(vi.fn()),
    off: vi.fn(),
  },
}));

describe("LearningManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("init", () => {
    it("should register settings, hooks, and menus", () => {
      LearningManager.init();

      expect(registerMigrationSettings).toHaveBeenCalled();
      expect(SettingsManager.registerAll).toHaveBeenCalled();
      expect(Settings.registerMenu).toHaveBeenCalledTimes(2);
      expect(Hooks.on).toHaveBeenCalled();
    });

    it("should register config expansions", () => {
      (global as any).CONFIG = { DND5E: { featureTypes: {} } };
      LearningManager.init();
      expect(global.CONFIG.DND5E.featureTypes["learning-project"]).toBeDefined();
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

      (global as any).fromUuid = vi.fn().mockResolvedValue({
        name: "Source Item",
        system: {},
      });
      (Settings.get as any).mockReturnValue(["world.items"]);

      const result = await callback(mockActor, {}, mockData);
      expect(result).toBe(false);
    });
  });
});
