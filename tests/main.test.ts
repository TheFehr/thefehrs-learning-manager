import { describe, it, expect, vi, beforeEach } from "vitest";
import { LearningManager } from "../src/LearningManager";
import { TabLogic } from "../src/tab-logic";
import { ActorProxy } from "../src/actor-proxy";
import { ProjectEngine } from "../src/project-engine";
import type { TimeUnit } from "../src/types";

vi.mock("../src/project-engine", () => ({
  ProjectEngine: {
    initiateProjectFromItem: vi.fn(),
    processTraining: vi.fn(),
    syncAllProjectActivities: vi.fn(),
    getActivitiesData: vi.fn().mockReturnValue([]),
    injectActivities: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("LearningManager", () => {
  const timeUnits: TimeUnit[] = [
    { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
    { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
    { id: "week", name: "Week", short: "w", isBulk: true, ratio: 70 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
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
        registerItemContent: vi.fn(),
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

      // Disallowed compendium item
      const otherItem = {
        uuid: "Compendium.secret.pack.Item.1",
        getFlag: vi.fn().mockReturnValue(false),
      };
      vi.mocked(game.settings.get).mockReturnValue(["allowed.pack"]);
      expect(enabled({ item: otherItem })).toBe(false);

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
      expect(enabled({ item: learningTypeItem })).toBe(true);
      expect(enabled({ document: learningTypeItem })).toBe(true);

      // Non-GM user
      game.user.isGM = false;
      expect(enabled({ item: learningTypeItem })).toBe(false);

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
      const actor = new Actor() as any;
      actor.flags = {
        "thefehrs-learning-manager": {
          bank: { total: 10 },
          projects: [{ id: "p1" }],
        },
      };

      vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
        if (key === "timeUnits") return timeUnits;
        return null;
      });

      const proxy = ActorProxy.forActor(actor);
      expect(proxy.bank.total).toBe(10);
      expect(proxy.projects).toHaveLength(1);
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
      global.fromUuid = vi.fn().mockResolvedValue(item);

      LearningManager.init();
      const dropHook = vi.mocked(Hooks.on).mock.calls.find((c) => c[0] === "dropActorSheetData");

      expect(dropHook).toBeDefined();
      const mockSheet = { activeTab: "any-tab" };
      await dropHook![1](groupActor, mockSheet, data);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(ProjectEngine.initiateProjectFromItem).toHaveBeenCalled();
    });
  });
});
