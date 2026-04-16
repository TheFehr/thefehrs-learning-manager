import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { mount, unmount } from "svelte";
import { LearningManager } from "@/LearningManager";
import { TabLogic } from "@/logic/tab-logic";
import { ActorProxy } from "@/logic/actor-proxy";
import { ProjectEngine } from "@/logic/project-engine";
import { Socket } from "@/core/socket";
import type { Actor5e, TimeUnit } from "@/types";
import { migrateData } from "@/migrations/migration";
import { registerMigrationSettings } from "@/migrations/migration-registration";
import { Logger } from "@/core/logger";

vi.mock("svelte", () => ({
  mount: vi.fn(),
  unmount: vi.fn(),
  tick: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/core/logger", () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/logic/project-engine", () => ({
  ProjectEngine: {
    initiateProjectFromItem: vi.fn(),
    processTraining: vi.fn(),
    syncAllProjectActivities: vi.fn(),
    getActivitiesData: vi.fn().mockReturnValue([]),
    injectActivities: vi.fn().mockResolvedValue(undefined),
    handleAutoTrainSignal: vi.fn(),
    signalTimeDistribution: vi.fn(),
  },
}));

vi.mock("@/migrations/migration", () => ({
  migrateData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/migrations/migration-registration", () => ({
  registerMigrationSettings: vi.fn(),
}));

describe("LearningManager", () => {
  const timeUnits: TimeUnit[] = [
    { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
    { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
    { id: "week", name: "Week", short: "w", isBulk: true, ratio: 70 },
  ];

  let originalFromUuid: any;
  let originalWindowEvent: any;

  beforeAll(() => {
    originalFromUuid = (globalThis as any).fromUuid;
    originalWindowEvent = (window as any).event;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    LearningManager.svelteInstances = new Map();
    LearningManager.socketHandler = null;

    if (originalFromUuid === undefined) {
      delete (globalThis as any).fromUuid;
    } else {
      (globalThis as any).fromUuid = originalFromUuid;
    }

    if (originalWindowEvent === undefined) {
      delete (window as any).event;
    } else {
      (window as any).event = originalWindowEvent;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    LearningManager.svelteInstances = new Map();
    LearningManager.socketHandler = null;

    if (originalFromUuid === undefined) {
      delete (globalThis as any).fromUuid;
    } else {
      (globalThis as any).fromUuid = originalFromUuid;
    }

    if (originalWindowEvent === undefined) {
      delete (window as any).event;
    } else {
      (window as any).event = originalWindowEvent;
    }
  });

  describe("TabLogic.formatTimeBank", () => {
    it("should format zero units correctly", () => {
      expect(TabLogic.formatTimeBank(0, timeUnits)).toBe("0");
    });

    it("should format single unit correctly", () => {
      expect(TabLogic.formatTimeBank(1, timeUnits)).toBe("1h");
    });

    it("should format multiple units correctly", () => {
      expect(TabLogic.formatTimeBank(11, timeUnits)).toBe("1d 1h");
    });

    it("should format bulk units correctly", () => {
      expect(TabLogic.formatTimeBank(81, timeUnits)).toBe("1w 1d 1h");
    });
  });

  describe("init", () => {
    it("should register settings, menus and tabs", () => {
      game.user.isGM = true;
      const api = {
        registerActorTab: vi.fn(),
        registerItemTab: vi.fn(),
        registerGroupTab: vi.fn(),
        registerCharacterTab: vi.fn(),
        registerNpcTab: vi.fn(),
        registerItemContent: vi.fn(),
        registerCharacterContent: vi.fn(),
        models: {
          HtmlTab: class {
            constructor(public opts: any) {}
          },
          HtmlContent: class {
            constructor(public opts: any) {}
          },
        },
      };

      LearningManager.init();
      expect(registerMigrationSettings).toHaveBeenCalled();
      expect(game.settings.register).toHaveBeenCalledWith(
        "thefehrs-learning-manager",
        "rules",
        expect.objectContaining({
          default: expect.objectContaining({ notificationLevel: "info" }),
        }),
      );
      expect(game.settings.registerMenu).toHaveBeenCalled();
      expect((CONFIG as any).DND5E.featureTypes["learning-project"]).toBeDefined();

      // Trigger the Tidy5e hook
      const tidyHook = vi
        .mocked(Hooks.once)
        .mock.calls.find((call) => call[0] === "tidy5e-sheet.ready");
      expect(tidyHook).toBeDefined();
      tidyHook![1](api);
      expect(api.registerGroupTab).toHaveBeenCalled();

      expect(api.registerItemTab).toHaveBeenCalled();
      const itemTabCall = vi.mocked(api.registerItemTab).mock.calls[0][0];
      const enabled = (itemTabCall as any).opts.enabled;

      // Character project item
      const projectItem = {
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "isLearningProject") return true;
          return null;
        }),
      };
      expect(enabled({ item: projectItem })).toBe(true);

      // Allowed compendium item
      const allowedItem = {
        uuid: "Compendium.allowed.pack.Item.1",
        getFlag: vi.fn().mockReturnValue(false),
      };
      expect(enabled({ item: allowedItem } as any)).toBe(true);

      // Custom learning type (subtype learning-project)
      const learningTypeItem = {
        type: "feat",
        system: { type: { value: "learning-project" } },
        getFlag: vi.fn().mockReturnValue(false),
        uuid: "Item.worlditem1",
      };
      expect(enabled({ item: learningTypeItem })).toBe(true);

      // Check different parameter paths
      expect(enabled({ document: learningTypeItem })).toBe(true);

      // Non-GM user
      game.user.isGM = false;
      expect(enabled({ item: learningTypeItem })).toBe(false);
      expect(enabled({ item: allowedItem } as any)).toBe(false);

      // Regular item (non-learning, non-compendium)
      game.user.isGM = true;
      const regularItem = {
        type: "weapon",
        system: { type: { value: "simpleM" } },
        getFlag: vi.fn().mockReturnValue(false),
        uuid: "Item.weapon1",
      };
      expect(enabled({ item: regularItem })).toBe(false);
    });
  });

  describe("registerSocketListeners", () => {
    it("should initialize Socket listener and handle timeGrantedSignal", async () => {
      let registeredHandler: ((msg: any) => Promise<void>) | undefined;
      vi.spyOn(Socket, "listen").mockImplementation((handler) => {
        registeredHandler = handler;
        return vi.fn();
      });
      const autoTrainSpy = vi.spyOn(ProjectEngine, "handleAutoTrainSignal").mockResolvedValue();

      LearningManager.registerSocketListeners();

      expect(Socket.listen).toHaveBeenCalled();
      expect(registeredHandler).toBeDefined();

      // Trigger the handler
      if (registeredHandler) {
        await registeredHandler({ type: "timeGrantedSignal", data: null });
        expect(autoTrainSpy).toHaveBeenCalled();
      }
    });

    it("should handle errors in socket handler gracefully", async () => {
      let registeredHandler: ((msg: any) => Promise<void>) | undefined;
      vi.spyOn(Socket, "listen").mockImplementation((handler) => {
        registeredHandler = handler;
        return vi.fn();
      });
      vi.spyOn(ProjectEngine, "handleAutoTrainSignal").mockRejectedValue(
        new Error("Auto-train failed"),
      );

      LearningManager.registerSocketListeners();

      if (registeredHandler) {
        await registeredHandler({ type: "timeGrantedSignal", data: null });
        expect(Logger.error).toHaveBeenCalledWith(
          expect.stringContaining("Failed to handle auto-train signal"),
          true,
          expect.any(Error),
        );
      }
    });
  });

  describe("ready", () => {
    it("should log initialized message and run migrations", async () => {
      await LearningManager.ready();
      expect(Logger.debug).toHaveBeenCalledWith(expect.stringContaining("Initialized"));
      expect(migrateData).toHaveBeenCalled();
    });
  });

  describe("meetsRequirements", () => {
    it("should return true for empty requirements", () => {
      const actor = new Actor() as any;
      const result = TabLogic.meetsRequirements(actor, []);
      expect(result.eligible).toBe(true);
    });

    it("should check numerical requirements", () => {
      const actor = new Actor() as any;
      actor.system.abilities = { int: { value: 14 } };
      const requirements = [
        { id: "r1", attribute: "system.abilities.int.value", operator: ">=", value: "14" },
      ] as any;

      const result = TabLogic.meetsRequirements(actor, requirements);
      expect(result.eligible).toBe(true);
    });
  });

  describe("ActorProxy", () => {
    it("should handle bank and projects", async () => {
      const actor = new Actor() as unknown as Actor5e;
      actor.items = [
        {
          id: "p1",
          name: "Project 1",
          getFlag: vi.fn().mockImplementation((_scope: string, key: string) => {
            if (key === "isLearningProject") return true;
            if (key === "projectData") return { progress: 0, target: 100 };
            return null;
          }),
        } as any,
      ];
      actor.flags = {
        "thefehrs-learning-manager": {
          bank: { total: 10 },
        },
      };

      vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
        if (key === "timeUnits") return timeUnits;
        return null;
      });

      const proxy = ActorProxy.forActor(actor);
      expect(proxy.bank.total).toBe(10);
      expect(proxy.getMappedProjects()).toHaveLength(1);
      expect(proxy.currency.gp).toBe(0);

      await proxy.setBank({ total: 20 });
      expect(actor.setFlag).toHaveBeenCalledWith("thefehrs-learning-manager", "bank", {
        total: 20,
      });
    });
  });

  describe("dropActorSheetData hook", () => {
    it("should initiate project when dropped on Group Sheet member", async () => {
      const groupActor = { type: "group", id: "group1" } as any;
      const memberActor = { type: "character", id: "member1", getFlag: vi.fn() } as any;
      const data = { type: "Item", uuid: "Compendium.pack.Item.123" };

      vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
        if (key === "allowedCompendiums") return ["pack.Item"];
        return null;
      });
      vi.mocked(game.actors.get).mockReturnValue(memberActor);

      // Mock DOM and Event
      const mockTarget = {
        closest: vi.fn().mockImplementation((selector) => {
          if (selector === ".thefehrs-party-tab") return true;
          if (selector === '[data-tidy-section*="learning-project"]') return false;
          if (selector === '[data-tidy-tab-id="features"]') return false;
          if (selector === '[data-tidy-section-key^="actor-"]')
            return {
              dataset: { tidySectionKey: "actor-member1" },
            };
          return null;
        }),
      };
      (window as any).event = { target: mockTarget };

      const item = new Item() as any;
      item.name = "Test Item";
      item.system = {}; // Added to pass if (item && "system" in item)
      item.getFlag = vi.fn().mockImplementation((scope, key) => {
        if (key === "projectData") return { requirements: [] };
        return null;
      });
      globalThis.fromUuid = vi.fn().mockResolvedValue(item);

      LearningManager.init();
      const dropHook = vi.mocked(Hooks.on).mock.calls.find((c) => c[0] === "dropActorSheetData");

      expect(dropHook).toBeDefined();
      const mockSheet = { activeTab: "any-tab" };
      await dropHook![1](groupActor, mockSheet, data);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(ProjectEngine.initiateProjectFromItem).toHaveBeenCalledWith(memberActor, item);
    });

    it("should return false when dropped on Group Sheet but member cannot be resolved", async () => {
      const groupActor = { type: "group", id: "group1" } as any;
      const data = { type: "Item", uuid: "Compendium.pack.Item.123" };

      vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
        if (key === "allowedCompendiums") return ["pack.Item"];
        return null;
      });

      // Mock DOM and Event - target returns null for all closest calls
      const mockTarget = {
        closest: vi.fn().mockReturnValue(null),
      };
      (window as any).event = { target: mockTarget };

      LearningManager.init();
      const dropHook = vi.mocked(Hooks.on).mock.calls.find((c) => c[0] === "dropActorSheetData");

      expect(dropHook).toBeDefined();
      const result = await dropHook![1](groupActor, {}, data);

      expect(result).toBe(false);
      expect(ProjectEngine.initiateProjectFromItem).not.toHaveBeenCalled();
    });
  });

  describe("TidyTabs", () => {
    it("should correctly enable/disable Item Tab", () => {
      let registeredTab: any;
      const mockApi = {
        registerActorTab: vi.fn(),
        registerItemTab: vi.fn().mockImplementation((tab) => {
          registeredTab = tab;
        }),
        registerGroupTab: vi.fn(),
        registerCharacterTab: vi.fn(),
        registerNpcTab: vi.fn(),
        registerItemContent: vi.fn(),
        registerCharacterContent: vi.fn(),
        models: {
          HtmlTab: class {
            constructor(data: any) {
              Object.assign(this, data);
            }
          },
          HtmlContent: class {
            constructor(data: any) {
              Object.assign(this, data);
            }
          },
        },
      };

      (LearningManager as any).registerTidyTabs(mockApi);
      expect(mockApi.registerItemTab).toHaveBeenCalled();

      const enabled = registeredTab.enabled;
      game.user.isGM = false;
      expect(enabled({})).toBe(false);

      game.user.isGM = true;
      const learningItem = {
        type: "feat",
        system: { type: { value: "learning-project" } },
        getFlag: vi.fn(),
      } as any;
      expect(enabled({ item: learningItem })).toBe(true);
    });
  });

  describe("Application Lifecycle", () => {
    it("should unmount Svelte instance when ApplicationV2 is closed", async () => {
      LearningManager.init();
      const mockInstance = { some: "instance" };
      LearningManager.svelteInstances.set("tab-v2-app", {
        instance: mockInstance,
        target: document.createElement("div"),
      });

      const closeHook = vi.mocked(Hooks.on).mock.calls.find((c) => c[0] === "closeApplicationV2");
      expect(closeHook).toBeDefined();

      closeHook![1]({ id: "v2-app" });

      expect(unmount).toHaveBeenCalledWith(mockInstance);
      expect(LearningManager.svelteInstances.has("tab-v2-app")).toBe(false);
    });

    it("should unmount prefixed Svelte instances when ApplicationV2 is closed", async () => {
      LearningManager.init();
      const mockMainInstance = { some: "main-instance" };
      const mockBarInstance = { some: "bar-instance" };

      LearningManager.svelteInstances.set("tab-app123", {
        instance: mockMainInstance,
        target: document.createElement("div"),
      });
      LearningManager.svelteInstances.set("time-bank-bar-app123", {
        instance: mockBarInstance,
        target: document.createElement("div"),
      });

      const closeHook = vi.mocked(Hooks.on).mock.calls.find((c) => c[0] === "closeApplicationV2");
      expect(closeHook).toBeDefined();

      closeHook![1]({ id: "app123" });

      expect(unmount).toHaveBeenCalledWith(mockMainInstance);
      expect(unmount).toHaveBeenCalledWith(mockBarInstance);
      expect(LearningManager.svelteInstances.has("tab-app123")).toBe(false);
      expect(LearningManager.svelteInstances.has("time-bank-bar-app123")).toBe(false);
    });

    it("should handle renderSvelte with existing instance and standardized prefix", async () => {
      const mockOldInstance = { old: true };
      const actor = { id: "actor1" };
      const app = { id: "app1", actor };
      LearningManager.svelteInstances.set("tab-app1", {
        instance: mockOldInstance,
        target: document.createElement("div"),
      });

      const params = { app, element: document.createElement("div") };
      const selector = ".root";
      params.element.innerHTML = '<div class="root"></div>';

      (LearningManager as any).renderSvelte(params, selector, {}, () => ({}), "tab");

      expect(unmount).toHaveBeenCalledWith(mockOldInstance);
      expect(mount).toHaveBeenCalled();
      expect(LearningManager.svelteInstances.get("tab-app1")).toBeDefined();
    });
  });
});
