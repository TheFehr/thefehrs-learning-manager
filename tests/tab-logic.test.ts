import { describe, it, expect, vi, beforeEach } from "vitest";
import { TabLogic } from "../src/tabs/tab-logic";
import { TheFehrsLearningManager } from "../src/main";

describe("TabLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.Roll = class {
      constructor(
        public formula: string,
        public data: any,
        public options: any,
      ) {}
      evaluate = vi.fn().mockResolvedValue({
        total: 15,
        dice: [{ faces: 20, results: [{ result: 15 }] }],
        toMessage: vi.fn(),
      });
    } as any;
  });

  describe("computeProgress", () => {
    const actor = {
      getRollData: () => ({}),
    } as any;
    const rules = { method: "roll", checkDC: 15, checkFormula: "1d20" };
    const tier = { modifier: 2, progress: { bulk1: 5 } };
    const tu = { id: "hour", isBulk: false };

    it("should return progress for bulk units", async () => {
      const bulkTu = { id: "bulk1", isBulk: true };
      const result = await TabLogic.computeProgress(actor, rules, tier, bulkTu);
      expect(result.progressGained).toBe(5);
    });

    it("should return 1 progress on successful roll", async () => {
      const result = await TabLogic.computeProgress(actor, rules, tier, tu);
      expect(result.progressGained).toBe(1);
      expect(result.roll).toBeDefined();
    });

    it("should return 0 progress on failed roll", async () => {
      global.Roll = class {
        evaluate = vi.fn().mockResolvedValue({
          total: 10,
          dice: [{ faces: 20, results: [{ result: 10 }] }],
        });
      } as any;
      const result = await TabLogic.computeProgress(actor, rules, tier, tu);
      expect(result.progressGained).toBe(0);
    });

    it("should handle 'any' crit strategy", async () => {
      const critRules = { ...rules, critDoubleStrategy: "any", critThreshold: 20 };
      global.Roll = class {
        evaluate = vi.fn().mockResolvedValue({
          total: 20,
          dice: [{ faces: 20, results: [{ result: 20 }] }],
        });
      } as any;
      const result = await TabLogic.computeProgress(actor, critRules, tier, tu);
      expect(result.progressGained).toBe(2);
    });

    it("should handle 'all' crit strategy", async () => {
      const critRules = { ...rules, critDoubleStrategy: "all", critThreshold: 20 };
      global.Roll = class {
        evaluate = vi.fn().mockResolvedValue({
          total: 20,
          dice: [
            { faces: 20, results: [{ result: 20 }] },
            { faces: 20, results: [{ result: 10 }] },
          ],
        });
      } as any;
      const result = await TabLogic.computeProgress(actor, critRules, tier, tu);
      expect(result.progressGained).toBe(1); // One failed to crit
    });
  });

  describe("Currency management", () => {
    const actor = {
      update: vi.fn().mockResolvedValue({}),
      system: { currency: { gp: 1, sp: 0, cp: 0 } },
    } as any;

    it("addCurrency should correctly add cp", async () => {
      await TabLogic.addCurrency(actor, 50); // Add 50cp
      expect(actor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          system: { currency: { gp: 1, sp: 5, cp: 0 } },
        }),
      );
    });

    it("deductCurrency should return false if insufficient funds", async () => {
      const result = await TabLogic.deductCurrency(actor, 200); // Need 200cp, only have 100
      expect(result).toBe(false);
      expect(ui.notifications.warn).toHaveBeenCalledWith("Insufficient funds!");
    });

    it("deductCurrency should correctly deduct across denominations", async () => {
      await TabLogic.deductCurrency(actor, 25); // Have 100cp, deduct 25
      expect(actor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          system: { currency: { gp: 0, sp: 7, cp: 5 } },
        }),
      );
    });
  });

  describe("meetsRequirements", () => {
    const actor = {
      name: "Test",
      system: {
        attributes: { str: { value: 10 } },
        traits: { languages: { value: ["common", "elvish"] } },
      },
    } as any;

    it("should handle 'includes' operator for arrays", () => {
      const req = [
        { attribute: "system.traits.languages.value", operator: "includes", value: "elvish" },
      ] as any;
      expect(TabLogic.meetsRequirements(actor, req).eligible).toBe(true);
    });

    it("should handle numerical comparisons", () => {
      const req = [{ attribute: "system.attributes.str.value", operator: ">", value: "5" }] as any;
      expect(TabLogic.meetsRequirements(actor, req).eligible).toBe(true);
    });

    it("should return reason on failure", () => {
      const req = [{ attribute: "system.attributes.str.value", operator: ">", value: "15" }] as any;
      const result = TabLogic.meetsRequirements(actor, req);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("system.attributes.str.value > 15");
    });
  });
});
