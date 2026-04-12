import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TabLogic } from "../../src/logic/tab-logic";

describe("TabLogic", () => {
  let originalRoll: any;

  beforeEach(() => {
    vi.clearAllMocks();
    originalRoll = global.Roll;
    /**
     * Stub for Foundry's Roll class.
     * Simulates basic evaluation, cloning, and d20 outcome overrides
     * used in success probability brute-forcing.
     */
    const BaseRoll =
      originalRoll ||
      class {
        constructor(
          public formula: string,
          public data: any = {},
        ) {}
      };
    global.Roll = class extends (BaseRoll as any) {
      dice: any[] = [];
      constructor(formula: string, data: any = {}) {
        super(formula, data);
        if (!this.formula) return;
        if (this.formula.includes("2d20")) {
          this.dice = [
            { faces: 20, number: 2, modifiers: ["kh1"], results: [{ result: 15, active: true }] },
          ];
        } else if (this.formula.includes("1d20") || this.formula.includes("d20")) {
          this.dice = [
            {
              faces: 20,
              number: 1,
              modifiers: [],
              results: [{ result: 15, active: true }],
              _evaluated: true,
            },
          ];
        }
      }
      async evaluate() {
        if (this._evaluated && this.total !== undefined) return this;

        let val = 0;
        if (this.dice.length > 0) {
          val = this.dice.reduce((acc: number, d: any) => acc + (d.results?.[0]?.result || 0), 0);
        } else if (!isNaN(Number(this.formula))) {
          val = Number(this.formula);
        }

        if (!this.formula) {
          this.total = val;
          this._evaluated = true;
          return this;
        }

        // Simple math parser for mock
        if (this.formula.includes("+")) {
          const parts = this.formula.split("+");
          val = 0;
          for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed === "Outcome") {
              // Handled by replacement in code usually
            } else if (!isNaN(Number(trimmed))) {
              val += Number(trimmed);
            } else if (trimmed === "@tutelage") {
              val += this.data?.tutelage || 0;
            } else if (trimmed.includes("2 * @abilities.int.mod")) {
              val += 2 * (this.data?.abilities?.int?.mod || 0);
            } else if (trimmed.includes("@abilities.int.mod")) {
              val += this.data?.abilities?.int?.mod || 0;
            }
          }
        } else {
          // Handle standalone modifiers or simple d20
          if (this.formula.includes("int.mod")) {
            val += this.data?.abilities?.int?.mod || 0;
          }
          if (this.formula.includes("@tutelage")) {
            val += this.data?.tutelage || 0;
          }
        }

        // Handle bulk formula logic
        if (this.formula.includes("@hours")) {
          const hours = this.data?.hours || 0;
          const dc = this.data?.dc || 0;
          const tutelage = this.data?.tutelage || 0;
          const intMod = this.data?.abilities?.int?.mod ?? 0;
          const minRoll = Math.max(1, dc - (intMod + tutelage));
          val = Math.round((hours * (22 - minRoll)) / 20);
        }

        this.total = val;
        this._evaluated = true;
        return this;
      }
    } as any;
  });

  afterEach(() => {
    global.Roll = originalRoll;
    vi.restoreAllMocks();
  });

  describe("computeProgress", () => {
    let actor: any;
    let rules: any;
    let tutelageMod: number;
    let tu: any;

    beforeEach(() => {
      actor = new Actor() as any;
      actor.system = { abilities: { int: { mod: 0 } } };
      actor.getRollData = function () {
        return this.system;
      };
      rules = { nonBulkMethod: "roll", bulkMethod: "direct", checkDC: 15, checkFormula: "1d20" };
      tutelageMod = 2;
      tu = { id: "hour", isBulk: false };
    });

    it("should return progress for non-bulk using 'direct' method", async () => {
      const directRules = { ...rules, nonBulkMethod: "direct" };
      const result = await TabLogic.computeProgress(actor, directRules, tutelageMod, tu);
      expect(result.progressGained).toBe(1);
    });

    it("should return 1 progress on successful non-bulk roll", async () => {
      const result = await TabLogic.computeProgress(actor, rules, tutelageMod, tu);
      expect(result.progressGained).toBe(1);
      expect(result.roll).toBeDefined();
    });

    it("should return 0 progress on failed non-bulk roll", async () => {
      global.Roll = class extends (global.Roll as any) {
        async evaluate() {
          this.total = 10;
          this.dice = [{ faces: 20, results: [{ result: 10, active: true }] }];
          this._evaluated = true;
          return this;
        }
      } as any;

      const result = await TabLogic.computeProgress(actor, rules, tutelageMod, tu);
      expect(result.progressGained).toBe(0);
      expect(result.reason).toContain("failed to meet DC");
    });

    it("should use mathematical method for bulk units", async () => {
      const bulkRules = { ...rules, bulkMethod: "mathematical", checkDC: 12 };
      const bulkTu = { id: "day", isBulk: true, ratio: 10 };
      actor.system.abilities = { int: { mod: 5 } };

      const result = await TabLogic.computeProgress(actor, bulkRules, tutelageMod, bulkTu as any);
      // Hours: 10, DC: 12, Mod: 5, Tutelage: 2.
      // 22 - (12 - (5 + 2)) = 22 - 5 = 17.
      // 10 * 17 / 20 = 170 / 20 = 8.5 => 9.
      expect(result.progressGained).toBe(9);
    });

    it("should allow 'roll' method for bulk units", async () => {
      const bulkRules = { ...rules, bulkMethod: "roll", checkDC: 15 };
      const bulkTu = { id: "day", isBulk: true, ratio: 10 };

      const result = await TabLogic.computeProgress(actor, bulkRules, tutelageMod, bulkTu as any);
      expect(result.progressGained).toBe(1);
    });

    it("should handle crit doubling in 'roll' method", async () => {
      const critRules = {
        ...rules,
        critDoubleStrategy: "any",
        critThreshold: 20,
      };
      global.Roll = class extends (global.Roll as any) {
        async evaluate() {
          this.total = 20;
          this.dice = [{ faces: 20, results: [{ result: 20, active: true }] }];
          this._evaluated = true;
          return this;
        }
      } as any;

      const result = await TabLogic.computeProgress(actor, critRules, tutelageMod, tu);
      expect(result.progressGained).toBe(2);
    });
  });

  describe("meetsRequirements", () => {
    let actor: any;

    beforeEach(() => {
      actor = new Actor() as any;
      actor.system = { abilities: { int: { value: 15 } } };
    });

    it("should return eligible true if all requirements met", () => {
      const reqs = [{ attribute: "system.abilities.int.value", operator: ">=", value: 13 }];
      const result = TabLogic.meetsRequirements(actor, reqs as any);
      expect(result.eligible).toBe(true);
    });

    it("should return eligible false with reason if requirement not met", () => {
      const reqs = [{ attribute: "system.abilities.int.value", operator: ">=", value: 18 }];
      const result = TabLogic.meetsRequirements(actor, reqs as any);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("Requirement not met");
      expect(result.reason).toContain(">= 18");
    });

    it("should support 'includes' operator", () => {
      actor.system.tags = ["tag1", "tag2"];
      const reqs = [{ attribute: "system.tags", operator: "includes", value: "tag1" }];
      const result = TabLogic.meetsRequirements(actor, reqs as any);
      expect(result.eligible).toBe(true);
    });

    it("should handle unknown operators gracefully", () => {
      const reqs = [{ attribute: "system.abilities.int.value", operator: "??", value: 10 }];
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = TabLogic.meetsRequirements(actor, reqs as any);
      expect(result.eligible).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe("formatCurrency", () => {
    it("should format cp correctly", () => {
      expect(TabLogic.formatCurrency(125)).toBe("1gp, 2sp, 5cp");
    });

    it("should handle 0", () => {
      expect(TabLogic.formatCurrency(0)).toBe("0cp");
    });

    it("should handle negative values", () => {
      expect(TabLogic.formatCurrency(-125)).toBe("-1gp, 2sp, 5cp");
    });
  });

  describe("formatTimeBank", () => {
    const units = [
      { id: "day", short: "d", ratio: 10 },
      { id: "hour", short: "h", ratio: 1 },
    ] as any[];

    it("should format whole units correctly", () => {
      expect(TabLogic.formatTimeBank(15, units)).toBe("1d 5h");
    });

    it("should handle 0", () => {
      expect(TabLogic.formatTimeBank(0, units)).toBe("0");
    });

    it("should handle fractional remaining time", () => {
      // 0.5 hours if hour is smallest
      expect(TabLogic.formatTimeBank(0.5, units)).toBe("0.5h");
    });
  });

  describe("calculateSuccessProbability", () => {
    const actor = { getRollData: vi.fn().mockReturnValue({}) } as any;
    const tutelageMod = 2;
    const rules = { checkFormula: "1d20 + @tutelage", checkDC: 15 } as any;

    it("should calculate correct probability for simple d20", async () => {
      const prob = await TabLogic.calculateSuccessProbability(actor, rules, tutelageMod);
      expect(prob).toBe(0.4); // 13-20 succeed (8/20)
    });

    it("should calculate correct probability with +0 modifier", async () => {
      const zeroRules = { checkFormula: "1d20 + 0", checkDC: 12 } as any;
      const prob = await TabLogic.calculateSuccessProbability(actor, zeroRules, 0);
      expect(prob).toBe(0.45); // 12-20 succeed (9/20)
    });

    it("should return 1 for deterministic success", async () => {
      const deterministicRules = { checkFormula: "20", checkDC: 15 } as any;
      const prob = await TabLogic.calculateSuccessProbability(
        actor,
        deterministicRules,
        tutelageMod,
      );
      expect(prob).toBe(1);
    });

    it("should return null for complex formulas", async () => {
      const complexRules = { checkFormula: "2d20kh1", checkDC: 15 } as any;
      const prob = await TabLogic.calculateSuccessProbability(actor, complexRules, tutelageMod);
      expect(prob).toBeNull();
    });
  });

  describe("calculateExpectedProgress", () => {
    const actor = {
      getRollData: () => ({ abilities: { int: { mod: 2 } } }),
    } as any;
    const tutelageMod = 2;

    it("should calculate expected progress accounting for crits (strategy: any)", async () => {
      const rules = {
        checkFormula: "1d20 + @abilities.int.mod + @tutelage",
        checkDC: 12,
        critDoubleStrategy: "any",
        critThreshold: 18,
      } as any;

      // DC 12, modifiers +4. Need 8+ on d20.
      // d20 outcomes:
      // 1-7 (7 outcomes): fail (0)
      // 8-17 (10 outcomes): success (1)
      // 18-20 (3 outcomes): crit success (2)
      // Total: (10 * 1) + (3 * 2) = 16
      // Expected: 16 / 20 = 0.8
      const exp = await TabLogic.calculateExpectedProgress(actor, rules, tutelageMod);
      expect(exp).toBe(0.8);
    });

    it("should calculate expected progress with never strategy", async () => {
      const rules = {
        checkFormula: "1d20 + @abilities.int.mod + @tutelage",
        checkDC: 12,
        critDoubleStrategy: "never",
        critThreshold: 18,
      } as any;

      // Total success outcomes: 13 (8-20)
      // Expected: 13 / 20 = 0.65
      const exp = await TabLogic.calculateExpectedProgress(actor, rules, tutelageMod);
      expect(exp).toBe(0.65);
    });

    it("should return NaN for complex formulas", async () => {
      const complexRules = {
        checkFormula: "2d20kh1 + 5",
        checkDC: 12,
      } as any;
      const exp = await TabLogic.calculateExpectedProgress(actor, complexRules, 0);
      expect(exp).toBeNaN();
    });
  });

  describe("deductCurrency", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it("should deduct currency correctly", async () => {
      const { TabLogic } = await import("../../src/logic/tab-logic");
      const actor = new Actor() as any;
      const mockProxy = {
        currency: { gp: 1, sp: 0, cp: 0 },
        updateCurrency: vi.fn().mockResolvedValue(true),
      };
      const { ActorProxy } = await import("../../src/logic/actor-proxy");
      vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);

      const success = await TabLogic.deductCurrency(actor, 50); // deduct 50cp from 100cp
      expect(success).toBe(true);
      expect(mockProxy.updateCurrency).toHaveBeenCalledWith({ gp: 0, sp: 5, cp: 0, ep: 0, pp: 0 });
    });

    it("should fail if insufficient funds", async () => {
      const { TabLogic } = await import("../../src/logic/tab-logic");
      const actor = new Actor() as any;
      const mockProxy = {
        currency: { gp: 0, sp: 0, cp: 10 },
        updateCurrency: vi.fn(),
      };
      const { ActorProxy } = await import("../../src/logic/actor-proxy");
      vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);
      vi.spyOn(ui.notifications, "warn").mockImplementation(() => {});

      const success = await TabLogic.deductCurrency(actor, 50);
      expect(success).toBe(false);
      expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("Insufficient"));
    });

    it("should return false if cost is negative or NaN", async () => {
      const { TabLogic } = await import("../../src/logic/tab-logic");
      const actor = new Actor() as any;

      expect(await TabLogic.deductCurrency(actor, -10)).toBe(false);
      expect(await TabLogic.deductCurrency(actor, NaN)).toBe(false);
    });
  });
});
