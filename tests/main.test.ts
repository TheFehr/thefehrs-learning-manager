import { describe, it, expect, vi, beforeEach } from "vitest";
import { TheFehrsLearningManager } from "../src/main";
import { TabLogic } from "../src/tabs/tab-logic";
import { ActorProxy } from "../src/actor-proxy";
import type { TimeUnit } from "../src/types";

describe("TheFehrsLearningManager", () => {
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
      const api = {
        registerActorTab: vi.fn(),
        models: {
          HtmlTab: class {
            constructor(public opts: any) {}
          },
        },
      };

      TheFehrsLearningManager.init();
      expect(game.settings.registerMenu).toHaveBeenCalled();
      expect((CONFIG as any).DND5E.featureTypes.learningProject).toBeDefined();

      // Trigger the Tidy5e hook
      const tidyHook = vi
        .mocked(Hooks.once)
        .mock.calls.find((call) => call[0] === "tidy5e-sheet.ready");
      if (tidyHook) {
        tidyHook[1](api);
        expect(api.registerActorTab).toHaveBeenCalled();
      }
    });
  });

  describe("registerSettings", () => {
    it("should register world settings", () => {
      TheFehrsLearningManager.registerSettings();
      expect(game.settings.register).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "rules",
        expect.objectContaining({ scope: "world", config: false }),
      );
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
        [TheFehrsLearningManager.ID]: {
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
      expect(actor.setFlag).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "bank", { total: 20 });
    });
  });
});
