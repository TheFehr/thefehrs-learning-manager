import { describe, it, expect, vi, beforeEach } from "vitest";
import { TabLogic } from "../src/tab-logic";

describe("TabLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.Roll = class {
      constructor(
        public formula: string,
        public data: any,
        public options: any,
      ) {}
      evaluate = vi.fn().mockImplementation(async () => {
        // Simple mock evaluator for test cases
        let total = 0;

        // Handle constant replacements (like bonusRoll evaluating totalMod)
        if (!isNaN(Number(this.formula))) {
          return { total: Number(this.formula), dice: [], toMessage: vi.fn() };
        }

        if (this.formula.includes("1d20")) {
          total += 15;
        }
        if (this.formula.includes("int.mod")) {
          total +=
            this.data?.attributes?.int?.mod ||
            this.data?.system?.abilities?.int?.mod ||
            this.data?.abilities?.int?.mod ||
            0;
        }
        if (this.formula.includes("@tutelage")) {
          total += this.data?.tutelage || 0;
        }

        // Handle mathematical formula for bonusRoll evaluation (totalMod)
        if (this.formula === "0") {
          return { total: total, dice: [], toMessage: vi.fn() };
        }

        // Handle bulkExpectedFormula variables
        if (
          this.formula.includes("@hours") ||
          this.formula.includes("@dc") ||
          this.formula.includes("@tutelage") ||
          this.formula.includes("@abilities")
        ) {
          const hours = this.data?.hours || 0;
          const dc = this.data?.dc || 0;
          const tutelage = this.data?.tutelage || 0;
          const intMod =
            this.data?.abilities?.int?.mod ?? this.data?.system?.abilities?.int?.mod ?? 0;

          // formula: round(@hours * (22 - max(1, @dc - (@abilities.int.mod + @tutelage))) / 20)
          const bonus = intMod + tutelage;
          const minRoll = Math.max(1, dc - bonus);
          total = Math.round((hours * (22 - minRoll)) / 20);
        }

        return {
          total: total || 15,
          dice: [{ faces: 20, results: [{ result: 15, active: true }] }],
          toMessage: vi.fn(),
        };
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
        system: { abilities: { int: { mod: 0 } } },
        getRollData: function () {
          return this.system;
        },
      } as any;
      rules = { nonBulkMethod: "roll", bulkMethod: "direct", checkDC: 15, checkFormula: "1d20" };
      tier = { modifier: 2, progress: { bulk1: 5 } };
      tu = { id: "hour", isBulk: false };
    });

    it("should return progress for bulk units using 'direct' method", async () => {
      const bulkTu = { id: "bulk1", isBulk: true };
      const result = await TabLogic.computeProgress(actor, rules, tier, bulkTu as any);
      expect(result.progressGained).toBe(5);
    });

    it("should return 1 progress on successful non-bulk roll", async () => {
      const result = await TabLogic.computeProgress(actor, rules, tier, tu);
      expect(result.progressGained).toBe(1);
      expect(result.roll).toBeDefined();
    });

    it("should return 0 progress on failed non-bulk roll", async () => {
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

    it("should use mathematical method for bulk units", async () => {
      const bulkRules = { ...rules, bulkMethod: "mathematical", checkDC: 12 };
      const bulkTu = { id: "day", isBulk: true, ratio: 10 };
      actor.system.abilities = { int: { mod: 5 } };

      const result = await TabLogic.computeProgress(actor, bulkRules, tier, bulkTu as any);

      // With DC 12, int mod 5, tutelage 2: minRoll is max(1, 12 - (5 + 2)) = 5.
      // Formula: round(10 * (22 - 5) / 20) = round(10 * 17 / 20) = round(8.5) = 9
      expect(result.progressGained).toBe(9);
    });

    it("should allow 'roll' method for bulk units", async () => {
      const bulkRules = { ...rules, bulkMethod: "roll", checkDC: 15 };
      const bulkTu = { id: "day", isBulk: true, ratio: 10 };

      const result = await TabLogic.computeProgress(actor, bulkRules, tier, bulkTu as any);
      expect(result.progressGained).toBe(1);
      expect(result.roll).toBeDefined();
    });

    it("should return a reason on zero bulk progress (direct)", async () => {
      const bulkTu = { id: "no_progress_unit", name: "Month", isBulk: true };
      const result = await TabLogic.computeProgress(actor, rules, undefined, bulkTu as any);
      expect(result.progressGained).toBe(0);
      expect(result.reason).toBe('Tutelage tier "None" provides no progress for Months.');
    });

    it("should handle 'any' crit strategy for non-bulk roll", async () => {
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

    it("should respect 'direct' method for non-bulk", async () => {
      const directRules = { ...rules, nonBulkMethod: "direct" };
      const result = await TabLogic.computeProgress(actor, directRules, tier, tu);
      expect(result.progressGained).toBe(1);
      expect(result.roll).toBeUndefined();
    });
  });

  describe("Currency Formatting", () => {
    it("should format currency correctly", () => {
      expect(TabLogic.formatCurrency(125)).toBe("1gp, 2sp, 5cp");
      expect(TabLogic.formatCurrency(5)).toBe("5cp");
      expect(TabLogic.formatCurrency(100)).toBe("1gp");
    });
  });

  describe("Time Bank Formatting", () => {
    const units = [
      { id: "hour", short: "h", ratio: 1, name: "Hour", isBulk: false },
      { id: "day", short: "d", ratio: 10, name: "Day", isBulk: true },
    ];

    it("should format time bank correctly", () => {
      expect(TabLogic.formatTimeBank(25, units)).toBe("2d 5h");
      expect(TabLogic.formatTimeBank(5, units)).toBe("5h");
      expect(TabLogic.formatTimeBank(0, units)).toBe("0");
    });
  });

  describe("Requirements Check", () => {
    it("should check requirements correctly", () => {
      const actor = { system: { abilities: { str: { value: 15 } } } } as any;
      const reqs = [{ attribute: "system.abilities.str.value", operator: ">=", value: 13 }];

      const result = TabLogic.meetsRequirements(actor, reqs as any);
      expect(result.eligible).toBe(true);
    });

    it("should fail on unmet requirements", () => {
      const actor = { system: { abilities: { str: { value: 10 } } } } as any;
      const reqs = [{ attribute: "system.abilities.str.value", operator: ">=", value: 13 }];

      const result = TabLogic.meetsRequirements(actor, reqs as any);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("needs to be >= 13");
    });
  });

  describe("calculateTotalBaseTime", () => {
    const timeUnits = [
      { id: "hour", ratio: 1, name: "Hour", short: "h", isBulk: false },
      { id: "day", ratio: 10, name: "Day", short: "d", isBulk: true },
    ];

    it("should calculate total base time correctly", () => {
      const result = TabLogic.calculateTotalBaseTime({ hour: 5, day: 2 }, timeUnits);
      expect(result).toBe(25);
    });

    it("should return 0 for empty values", () => {
      const result = TabLogic.calculateTotalBaseTime({}, timeUnits);
      expect(result).toBe(0);
    });

    it("should handle invalid inputs gracefully", () => {
      const result = TabLogic.calculateTotalBaseTime({ hour: "10" as any, day: 1 }, timeUnits);
      expect(result).toBe(20);
    });
  });
});
