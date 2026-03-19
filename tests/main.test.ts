import { describe, it, expect, vi, beforeEach } from "vitest";
import { TheFehrsLearningManager } from "../src/main";
import { TabLogic } from "../src/tabs/tab-logic";
import { LearningTab } from "../src/tabs/learning-tab";
import { ActorProxy } from "../src/actor-proxy";
import type { TimeUnit } from "../src/types";

describe("TheFehrsLearningManager", () => {
  const timeUnits: TimeUnit[] = [
    { id: "tu_hr", name: "Hour", short: "h", isBulk: false, ratio: 1 },
    { id: "tu_day", name: "Day", short: "d", isBulk: true, ratio: 10 },
    { id: "tu_wk", name: "Week", short: "w", isBulk: true, ratio: 70 },
  ];

  describe("formatTimeBank", () => {
    it('should format negative values properly or return "0" for 0 units', () => {
      expect(TabLogic.formatTimeBank(0, timeUnits)).toBe("0");
      expect(TabLogic.formatTimeBank(-5, timeUnits)).toBe("-5h");
    });

    it('should return "0" for empty timeUnits', () => {
      expect(TabLogic.formatTimeBank(10, [])).toBe("0");
    });

    it("should format units correctly based on ratios", () => {
      // 1 hour
      expect(TabLogic.formatTimeBank(1, timeUnits)).toBe("1h");
      // 10 hours = 1 day
      expect(TabLogic.formatTimeBank(10, timeUnits)).toBe("1d");
      // 11 hours = 1 day 1 hour
      expect(TabLogic.formatTimeBank(11, timeUnits)).toBe("1d 1h");
      // 70 hours = 1 week
      expect(TabLogic.formatTimeBank(70, timeUnits)).toBe("1w");
      // 81 hours = 1 week 1 day 1 hour
      expect(TabLogic.formatTimeBank(81, timeUnits)).toBe("1w 1d 1h");
    });
  });

  describe("init", () => {
    it("should register settings and menus", () => {
      TheFehrsLearningManager.init();
      expect(game.settings.registerMenu).toHaveBeenCalled();
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

  describe("LearningTab.getData", () => {
    it("should return correct data for actor", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        [TheFehrsLearningManager.ID]: {
          bank: { total: 15 },
          projects: [
            { id: "p1", templateId: "tpl1", progress: 5 },
            { id: "p2", templateId: "tpl2", progress: 10 },
          ],
        },
      };

      vi.mocked(game.settings.get).mockImplementation((scope, key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "projectTemplates")
          return [
            { id: "tpl1", name: "Project 1", target: 10 },
            { id: "tpl2", name: "Project 2", target: 10 },
          ];
        if (key === "guidanceTiers") return [];
        return null;
      });

      const data = await LearningTab.getData(actor);

      expect(data.formattedBank).toBe("1d 5h");
      expect(data.activeProjects).toHaveLength(1);
      expect(data.completedProjects).toHaveLength(1);
    });
  });

  describe("meetsRequirements", () => {
    it("should return true for empty requirements", () => {
      const actor = new Actor() as any;
      const result = TabLogic.meetsRequirements(actor, []);
      expect(result.eligible).toBe(true);
    });
  });

  describe("ActorProxy", () => {
    it("should correctly wrap actor methods", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        [TheFehrsLearningManager.ID]: {
          bank: { total: 10 },
          projects: [{ id: "p1", templateId: "tpl1" }],
        },
      };
      actor.system = { currency: { gp: 5, sp: 2, cp: 3 } };

      const proxy = new ActorProxy(actor);

      expect(proxy.bank.total).toBe(10);
      expect(proxy.projects).toHaveLength(1);
      expect(proxy.currency.gp).toBe(5);

      await proxy.setBank({ total: 20 });
      expect(actor.setFlag).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "bank", { total: 20 });
    });
  });
});
