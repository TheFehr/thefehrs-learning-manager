import { describe, it, expect, vi, beforeEach } from "vitest";
import { TabLogic } from "../src/tab-logic";
import { LearningManager } from "../src/LearningManager";

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
        dice: [{ faces: 20, results: [{ result: 15, active: true }] }],
        toMessage: vi.fn(),
      });
    } as any;
  });

  describe("computeProgress", () => {
    let actor: any;
    let rules: any;
    let tier: any;
    let tu: any;

    beforeEach(() => {
      actor = {
        getRollData: () => ({}),
      } as any;
      rules = { method: "roll", checkDC: 15, checkFormula: "1d20" };
      tier = { modifier: 2, progress: { bulk1: 5 } };
      tu = { id: "hour", isBulk: false };
    });

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
          dice: [{ faces: 20, results: [{ result: 10, active: true }] }],
        });
      } as any;
      const result = await TabLogic.computeProgress(actor, rules, tier, tu);
      expect(result.progressGained).toBe(0);
      expect(result.reason).toBe("Roll total 10 failed to meet DC 15.");
    });

    it("should return a reason on zero bulk progress", async () => {
      const bulkTu = { id: "no_progress_unit", name: "Month", isBulk: true };
      const result = await TabLogic.computeProgress(actor, rules, undefined, bulkTu as any);
      expect(result.progressGained).toBe(0);
      expect(result.reason).toBe('Tutelage tier "None" provides no progress for Months.');
    });

    it("should handle 'any' crit strategy", async () => {
      const critRules = { ...rules, critDoubleStrategy: "any", critThreshold: 20 };
      global.Roll = class {
        evaluate = vi.fn().mockResolvedValue({
          total: 20,
          dice: [{ faces: 20, results: [{ result: 20, active: true }] }],
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
            { faces: 20, results: [{ result: 20, active: true }] },
            { faces: 20, results: [{ result: 10, active: true }] },
          ],
        });
      } as any;
      const result = await TabLogic.computeProgress(actor, critRules, tier, tu);
      expect(result.progressGained).toBe(1); // One failed to crit
    });

    it("should ignore discarded dice results", async () => {
      const critRules = { ...rules, critDoubleStrategy: "any", critThreshold: 20 };
      global.Roll = class {
        evaluate = vi.fn().mockResolvedValue({
          total: 15, // Active is only 15
          dice: [
            {
              faces: 20,
              results: [
                { result: 20, active: false }, // Discarded
                { result: 15, active: true }, // Kept
              ],
            },
          ],
        });
      } as any;
      const result = await TabLogic.computeProgress(actor, critRules, tier, tu);
      expect(result.progressGained).toBe(1); // Should not double, because 20 was discarded
    });
  });

  describe("Currency management", () => {
    let actor: any;

    beforeEach(() => {
      actor = {
        update: vi.fn().mockResolvedValue({}),
        system: { currency: { gp: 1, sp: 0, cp: 0 } },
      } as any;
    });

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
    let actor: any;

    beforeEach(() => {
      actor = {
        name: "Test",
        system: {
          attributes: { str: { value: 10 } },
          traits: { languages: { value: ["common", "elvish"] } },
        },
      } as any;
    });

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

  describe("formatCurrency", () => {
    it("should format 125 cp as 1gp 2sp 5cp", () => {
      expect(TabLogic.formatCurrency(125)).toBe("1gp 2sp 5cp");
    });

    it("should format 50 cp as 5sp", () => {
      expect(TabLogic.formatCurrency(50)).toBe("5sp");
    });

    it("should format 5 cp as 5cp", () => {
      expect(TabLogic.formatCurrency(5)).toBe("5cp");
    });

    it("should format 0 cp as 0cp", () => {
      expect(TabLogic.formatCurrency(0)).toBe("0cp");
    });

    it("should format 100 cp as 1gp", () => {
      expect(TabLogic.formatCurrency(100)).toBe("1gp");
    });

    it("should format negative amounts", () => {
      expect(TabLogic.formatCurrency(-125)).toBe("-1gp 2sp 5cp");
    });
  });

  describe("calculateTotalBaseTime", () => {
    const timeUnits = [
      { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
      { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
    ] as any[];

    it("should return 0 if no time is entered", () => {
      const result = TabLogic.calculateTotalBaseTime({}, timeUnits);
      expect(result).toBe(0);
    });

    it("should correctly calculate total base time for numbers", () => {
      const result = TabLogic.calculateTotalBaseTime({ hour: 5, day: 2 }, timeUnits);
      expect(result).toBe(25); // 5*1 + 2*10
    });

    it("should correctly calculate total base time for strings", () => {
      const result = TabLogic.calculateTotalBaseTime(
        { hour: "5" as any, day: "2" as any },
        timeUnits,
      );
      expect(result).toBe(25);
    });

    it("should handle mixed numeric and string values", () => {
      const result = TabLogic.calculateTotalBaseTime({ hour: "10" as any, day: 1 }, timeUnits);
      expect(result).toBe(20);
    });

    it("should handle null or undefined values by treating them as 0", () => {
      const result = TabLogic.calculateTotalBaseTime(
        { hour: null as any, day: undefined as any },
        timeUnits,
      );
      expect(result).toBe(0);
    });

    it("should ignore NaN values", () => {
      const result = TabLogic.calculateTotalBaseTime({ hour: "abc" as any, day: 1 }, timeUnits);
      expect(result).toBe(10);
    });

    it("should handle empty or partial timeValues", () => {
      const result = TabLogic.calculateTotalBaseTime({ day: 3 }, timeUnits);
      expect(result).toBe(30);
    });
  });
});
