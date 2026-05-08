import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TabLogic } from "../../src/logic/tab-logic";
import { MockRoll } from "../mocks/roll";
import { Logger } from "../../src/core/logger";

describe("TabLogic", () => {
  let originalRoll: any;

  function createMockRollOverride({ total, dice }: { total: number; dice: any[] }) {
    return class extends MockRoll {
      evaluate() {
        this.total = total;
        this.dice = dice;
        this._evaluated = true;
        return this;
      }
    } as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    originalRoll = globalThis.Roll;
    globalThis.Roll = MockRoll as any;
  });

  afterEach(() => {
    globalThis.Roll = originalRoll;
    vi.restoreAllMocks();
  });

  describe("computeProgress", () => {
    let actor: any;
    let rules: any;
    let tutelageMod: number;
    let tu: any;

    beforeEach(() => {
      actor = new Actor() as any;
      actor.system = { abilities: { int: { mod: 0 } }, attributes: {} };
      actor.getRollData = function () {
        return this.system;
      };
      rules = { nonBulkMethod: "roll", bulkMethod: "direct", checkDC: 15, checkFormula: "1d20" };
      tutelageMod = 2;
      tu = { id: "hour", isBulk: false, ratio: 1 };
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
      globalThis.Roll = createMockRollOverride({
        total: 10,
        dice: [{ faces: 20, results: [{ result: 10, active: true }] }],
      });

      const result = await TabLogic.computeProgress(actor, rules, tutelageMod, tu);
      expect(result.progressGained).toBe(0);
      expect(result.reason).toContain("failed to meet DC");
    });

    it("should use mathematical method for bulk units", async () => {
      const bulkRules = {
        ...rules,
        bulkMethod: "mathematical",
        checkDC: 12,
        checkFormula: "1d20 + @abilities.int.mod + @tutelage",
      };
      const bulkTu = { id: "day", isBulk: true, ratio: 10 };
      actor.system.abilities = { int: { mod: 5 } };

      const result = await TabLogic.computeProgress(actor, bulkRules, tutelageMod, bulkTu as any);
      // Expected: round(10 * (22 - (12 - 7)) / 20) = 9
      expect(result.progressGained).toBe(9);
    });

    it("should handle unsupported modifiers in mathematical method", async () => {
      const bulkRules = {
        ...rules,
        bulkMethod: "mathematical",
        checkDC: 12,
        checkFormula: "3d20r1 + 5",
      };
      const bulkTu = { id: "day", isBulk: true, ratio: 10 };

      const warnSpy = vi.spyOn(Logger, "warn").mockImplementation(() => {});

      const result = await TabLogic.computeProgress(actor, bulkRules, tutelageMod, bulkTu as any);
      // "3d20r1 + 5" contains unsupported reroll "r1", so it falls back to simple average:
      // 1. Die expectation for 3d20 is (3 * (20 + 1)) / 2 = 31.5.
      // 2. computeProgress rewrites the dice term using getDieExpectation: (31.5 - 10.5) => 21.
      // 3. modFormula becomes "21 + 5" and mod = 26.
      // 4. Progress gained = round(ratio * (22 - max(1, dc - mod)) / 20)
      //    = round(10 * (22 - max(1, 12 - 26)) / 20)
      //    = round(10 * (22 - 1) / 20) = round(10.5) = 11.
      expect(result.progressGained).toBe(11);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unsupported dice modifier"));
      warnSpy.mockRestore();
    });

    it("should return 1 for deterministic success", async () => {
      const deterministicRules = {
        ...rules,
        nonBulkMethod: "roll",
        checkFormula: "20",
        checkDC: 15,
      };
      const result = await TabLogic.computeProgress(actor, deterministicRules, tutelageMod, tu);
      expect(result.progressGained).toBe(1);
    });

    it("should handle roll.evaluate() failure", async () => {
      const invalidRules = { ...rules, checkFormula: "1d20" };
      globalThis.Roll = class {
        data: any;
        constructor(formula: string, data: any) {
          this.data = data;
        }
        async evaluate() {
          throw new Error("Roll failed");
        }
      } as any;

      const result = await TabLogic.computeProgress(actor, invalidRules, tutelageMod, tu);
      expect(result.progressGained).toBe(0);
      expect(result.reason).toContain("Invalid check formula");
    });

    it("should allow 'roll' method for bulk units and return ratio as progress", async () => {
      const bulkRules = { ...rules, bulkMethod: "roll", checkDC: 15 };
      const bulkTu = { id: "day", isBulk: true, ratio: 10 };

      const result = await TabLogic.computeProgress(actor, bulkRules, tutelageMod, bulkTu as any);
      expect(result.progressGained).toBe(10);
    });

    it("should handle crit doubling in 'roll' method", async () => {
      const critRules = {
        ...rules,
        critDoubleStrategy: "any",
        critThreshold: 20,
      };
      globalThis.Roll = createMockRollOverride({
        total: 20,
        dice: [{ faces: 20, results: [{ result: 20, active: true }] }],
      });

      const result = await TabLogic.computeProgress(actor, critRules, tutelageMod, tu);
      expect(result.progressGained).toBe(2);
    });

    it("should handle 'all' crit strategy", async () => {
      const critRules = {
        ...rules,
        critDoubleStrategy: "all",
        critThreshold: 18,
      };
      globalThis.Roll = createMockRollOverride({
        total: 20,
        dice: [
          {
            faces: 20,
            results: [
              { result: 19, active: true },
              { result: 18, active: true },
            ],
          },
        ],
      });

      const result = await TabLogic.computeProgress(actor, critRules, tutelageMod, tu);
      expect(result.progressGained).toBe(2);
    });

    it("should return 0 and reason if formula is invalid in 'roll' method", async () => {
      const invalidRules = { ...rules, checkFormula: "invalid" };
      globalThis.Roll = class {
        constructor() {
          throw new Error("Invalid formula");
        }
      } as any;

      const result = await TabLogic.computeProgress(actor, invalidRules, tutelageMod, tu);
      expect(result.progressGained).toBe(0);
      expect(result.reason).toContain("Invalid check formula");
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
      const warnSpy = vi.spyOn(Logger, "warn").mockImplementation(() => {});
      const result = TabLogic.meetsRequirements(actor, reqs as any);
      expect(result.eligible).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
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
    it("should deduct currency correctly", async () => {
      const actor = new Actor() as any;
      const mockProxy = {
        currency: { gp: 1, sp: 0, cp: 0, ep: 0, pp: 0 },
        updateCurrency: vi.fn().mockResolvedValue(true),
      };
      const { ActorProxy } = await import("../../src/logic/actor-proxy");
      const spy = vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);

      const success = await TabLogic.deductCurrency(actor, 50); // deduct 50cp from 100cp
      expect(success).toBe(true);
      expect(mockProxy.updateCurrency).toHaveBeenCalledWith({ pp: 0, gp: 0, ep: 0, sp: 5, cp: 0 });
      spy.mockRestore();
    });

    it("should fail if insufficient funds", async () => {
      const actor = new Actor() as any;
      const mockProxy = {
        currency: { gp: 0, sp: 0, cp: 10, ep: 0, pp: 0 },
        updateCurrency: vi.fn(),
      };
      const { ActorProxy } = await import("../../src/logic/actor-proxy");
      const spy = vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);
      vi.spyOn(ui.notifications, "warn").mockImplementation(() => {});

      const success = await TabLogic.deductCurrency(actor, 50);
      expect(success).toBe(false);
      expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("Insufficient"));
      spy.mockRestore();
    });

    it("should return false if cost is negative or NaN", async () => {
      const actor = new Actor() as any;

      expect(await TabLogic.deductCurrency(actor, -10)).toBe(false);
      expect(await TabLogic.deductCurrency(actor, NaN)).toBe(false);
    });

    it("should coerce fractional cost and log warning", async () => {
      const actor = new Actor() as any;
      const mockProxy = {
        currency: { gp: 1, sp: 0, cp: 0, ep: 0, pp: 0 },
        updateCurrency: vi.fn().mockResolvedValue(true),
      };
      const { ActorProxy } = await import("../../src/logic/actor-proxy");
      const spy = vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);
      const warnSpy = vi.spyOn(Logger, "warn").mockImplementation(() => {});

      const success = await TabLogic.deductCurrency(actor, 50.5);
      expect(success).toBe(true);
      expect(mockProxy.updateCurrency).toHaveBeenCalledWith({ pp: 0, gp: 0, ep: 0, sp: 5, cp: 0 });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("not an integer"));

      spy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe("addCurrency", () => {
    it("should add currency correctly", async () => {
      const actor = new Actor() as any;
      const mockProxy = {
        currency: { gp: 0, sp: 0, cp: 0, ep: 0, pp: 0 },
        updateCurrency: vi.fn().mockResolvedValue(true),
      };
      const { ActorProxy } = await import("../../src/logic/actor-proxy");
      const spy = vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);

      const success = await TabLogic.addCurrency(actor, 150); // add 1gp, 5sp
      expect(success).toBe(true);
      expect(mockProxy.updateCurrency).toHaveBeenCalledWith({ pp: 0, gp: 1, ep: 0, sp: 5, cp: 0 });
      spy.mockRestore();
    });

    it("should skip pp and ep if current balance is zero", async () => {
      const actor = new Actor() as any;
      const mockProxy = {
        currency: { gp: 0, sp: 0, cp: 0, ep: 0, pp: 0 },
        updateCurrency: vi.fn().mockResolvedValue(true),
      };
      const { ActorProxy } = await import("../../src/logic/actor-proxy");
      const spy = vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);

      const success = await TabLogic.addCurrency(actor, 1050); // 1pp + 5sp OR 10gp + 5sp
      expect(success).toBe(true);
      // Should be 10gp, 5sp because pp is skipped
      expect(mockProxy.updateCurrency).toHaveBeenCalledWith({ pp: 0, gp: 10, ep: 0, sp: 5, cp: 0 });
      spy.mockRestore();
    });

    it("should NOT skip pp and ep if current balance is non-zero", async () => {
      const actor = new Actor() as any;
      const mockProxy = {
        currency: { gp: 0, sp: 0, cp: 0, ep: 1, pp: 1 },
        updateCurrency: vi.fn().mockResolvedValue(true),
      };
      const { ActorProxy } = await import("../../src/logic/actor-proxy");
      const spy = vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);

      const success = await TabLogic.addCurrency(actor, 1050);
      expect(success).toBe(true);
      expect(mockProxy.updateCurrency).toHaveBeenCalledWith({ pp: 2, gp: 0, ep: 2, sp: 0, cp: 0 });
      spy.mockRestore();
    });

    it("should return false if amount is negative or NaN", async () => {
      const actor = new Actor() as any;
      expect(await TabLogic.addCurrency(actor, -10)).toBe(false);
      expect(await TabLogic.addCurrency(actor, NaN)).toBe(false);
    });

    it("should coerce fractional amount and log warning", async () => {
      const actor = new Actor() as any;
      const mockProxy = {
        currency: { gp: 0, sp: 0, cp: 0, ep: 0, pp: 0 },
        updateCurrency: vi.fn().mockResolvedValue(true),
      };
      const { ActorProxy } = await import("../../src/logic/actor-proxy");
      const spy = vi.spyOn(ActorProxy, "forActor").mockReturnValue(mockProxy as any);
      const warnSpy = vi.spyOn(Logger, "warn").mockImplementation(() => {});

      const success = await TabLogic.addCurrency(actor, 10.5);
      expect(success).toBe(true);
      expect(mockProxy.updateCurrency).toHaveBeenCalledWith({ pp: 0, gp: 0, ep: 0, sp: 1, cp: 0 });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("not an integer"));

      spy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});
