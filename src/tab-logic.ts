import { ActorProxy } from "./actor-proxy.js";
import type {
  LearningActor,
  TimeUnit,
  ProjectRequirement,
  ComparisonOperator,
  SystemRules,
  GuidanceTier,
} from "./types.js";

export class TabLogic {
  static async computeProgress(
    actor: LearningActor,
    rules: SystemRules,
    tier: GuidanceTier | undefined,
    tu: TimeUnit,
  ): Promise<{ progressGained: number; roll?: Roll<any>; reason?: string }> {
    let progressGained = 0;
    let roll: Roll<any> | undefined = undefined;
    let reason: string | undefined = undefined;

    const effectiveMethod = tu.isBulk ? rules.bulkMethod : rules.nonBulkMethod;

    if (effectiveMethod === "direct") {
      if (tu.isBulk) {
        progressGained = tier?.progress?.[tu.id] || 0;
        if (progressGained === 0) {
          reason = `Tutelage tier "${tier?.name || "None"}" provides no progress for ${tu.name}s.`;
        }
      } else {
        progressGained = 1;
      }
    } else if (effectiveMethod === "roll") {
      if (!rules.checkFormula) {
        return { progressGained: 0, reason: "No check formula defined in rules." };
      }

      roll = await new Roll(
        rules.checkFormula,
        {
          ...actor.getRollData(),
          tutelage: tier?.modifier || 0,
        },
        // @ts-expect-error - Foundry Roll constructor accepts target in options
        { target: rules.checkDC },
      ).evaluate();

      let multiplier = 1;
      const strategy = rules.critDoubleStrategy ?? "never";
      const threshold = rules.critThreshold ?? 20;

      if (strategy !== "never") {
        const d20s = (roll.dice ?? []).filter((die) => die.faces === 20);
        if (d20s.length > 0) {
          if (strategy === "any") {
            if (d20s.some((die) => die.results?.some((r) => r.active && r.result >= threshold)))
              multiplier = 2;
          } else if (strategy === "all") {
            if (d20s.every((die) => die.results?.every((r) => r.active && r.result >= threshold)))
              multiplier = 2;
          }
        }
      }

      if (roll.total >= (rules.checkDC || 0)) {
        progressGained = 1 * multiplier;
      } else {
        reason = `Roll total ${roll.total} failed to meet DC ${rules.checkDC}.`;
      }
    } else if (effectiveMethod === "mathematical") {
      const hours = tu.ratio;
      const tutelageMod = tier?.modifier || 0;
      const dc = rules.checkDC ?? 12;
      const bulkFormula =
        rules.bulkExpectedFormula ||
        "round(@hours * (22 - max(1, @dc - (@abilities.int.mod + @tutelage))) / 20)";

      const formulaData = {
        ...actor.getRollData(),
        tutelage: tutelageMod,
        hours: hours,
        dc: dc,
      };

      const expectedRoll = await new Roll(bulkFormula, formulaData).evaluate();
      progressGained = Math.max(0, expectedRoll.total);

      console.debug("Downtime Engine | Bulk Expected Progress (Formula):", {
        bulkFormula,
        formulaData,
        progressGained,
      });
    }

    return { progressGained, roll, reason };
  }

  /**
   * Calculates the success probability (0-1) for a single training roll.
   */
  static async calculateSuccessProbability(
    actor: LearningActor,
    rules: SystemRules,
    tier: GuidanceTier | undefined,
  ): Promise<number> {
    if (!rules.checkFormula || !rules.checkDC) return 0;

    try {
      // 1. Resolve the formula's static modifier by replacing 1d20 with 0
      const staticFormula = rules.checkFormula.replace(/\b1?\s*d20\b/gi, "0");
      const staticRoll = await new Roll(staticFormula, {
        ...actor.getRollData(),
        tutelage: tier?.modifier || 0,
      }).evaluate();

      const modifier = staticRoll.total;
      const targetRoll = rules.checkDC - modifier;

      // 2. Linear probability for a d20 roll
      // To succeed, d20 >= targetRoll
      // Number of successful outcomes: 21 - targetRoll (clamped to 0-20)
      const successCount = Math.min(20, Math.max(0, 21 - targetRoll));
      return successCount / 20;
    } catch (err) {
      console.error("Downtime Engine | Failed to calculate success probability:", err);
      return 0;
    }
  }

  static async addCurrency(actor: Actor, amountCp: number) {
    if (amountCp < 0) {
      return this.deductCurrency(actor, -amountCp);
    }
    const proxy = ActorProxy.forActor(actor);
    const cur = proxy.currency;
    let totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    totalCp += amountCp;
    const newGp = Math.floor(totalCp / 100);
    totalCp %= 100;
    const newSp = Math.floor(totalCp / 10);
    const newCp = totalCp % 10;

    await proxy.updateCurrency({ gp: newGp, sp: newSp, cp: newCp });
  }

  static async deductCurrency(actor: Actor, amountCp: number): Promise<boolean> {
    if (amountCp < 0) {
      console.warn("Negative amount deducted");
      return false;
    }
    const proxy = ActorProxy.forActor(actor);
    const cur = proxy.currency;
    let totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (totalCp < amountCp) {
      ui.notifications?.warn("Insufficient funds!");
      return false;
    }

    totalCp -= amountCp;
    const newGp = Math.floor(totalCp / 100);
    totalCp %= 100;
    const newSp = Math.floor(totalCp / 10);
    const newCp = totalCp % 10;

    await proxy.updateCurrency({ gp: newGp, sp: newSp, cp: newCp });
    return true;
  }

  static meetsRequirements(
    actor: Actor,
    requirements: ProjectRequirement[],
  ): { eligible: boolean; reason: string } {
    for (const req of requirements) {
      const actorValue = foundry.utils.getProperty(actor, req.attribute);
      const targetValue = req.value;
      const op: ComparisonOperator = req.operator;

      let met = false;
      // Note: == and != intentionally use loose equality for type coercion (e.g. "5" == 5)
      if (op === "==") met = actorValue == targetValue;
      else if (op === "!=") met = actorValue != targetValue;
      else if (op === "===") met = actorValue === targetValue;
      else if (op === "!==") met = actorValue !== targetValue;
      else if (op === "includes")
        met = Array.isArray(actorValue)
          ? actorValue.includes(targetValue)
          : String(actorValue).includes(String(targetValue));
      else if (op === ">") met = actorValue > targetValue;
      else if (op === ">=") met = actorValue >= targetValue;
      else if (op === "<") met = actorValue < targetValue;
      else if (op === "<=") met = actorValue <= targetValue;

      if (!met) {
        return {
          eligible: false,
          reason: `${req.attribute} is ${actorValue}, but needs to be ${op} ${targetValue}.`,
        };
      }
    }
    return { eligible: true, reason: "" };
  }

  static formatCurrency(amountCp: number): string {
    const isNegative = amountCp < 0;
    const abs = Math.abs(amountCp);
    const gp = Math.floor(abs / 100);
    const sp = Math.floor((abs % 100) / 10);
    const cp = abs % 10;
    const parts = [];
    if (gp > 0) parts.push(`${gp}gp`);
    if (sp > 0) parts.push(`${sp}sp`);
    if (cp > 0 || parts.length === 0) parts.push(`${cp}cp`);
    const formatted = parts.join(", ");
    return isNegative ? `-${formatted}` : formatted;
  }

  static formatTimeBank(total: number, units: TimeUnit[]): string {
    if (total === 0) return "0";
    const sortedUnits = [...units].sort((a, b) => b.ratio - a.ratio);
    const result = [];
    let remaining = total;
    for (const unit of sortedUnits) {
      const count = Math.floor(remaining / unit.ratio);
      if (count > 0) {
        result.push(`${count}${unit.short}`);
        remaining %= unit.ratio;
      }
    }
    return result.length > 0 ? result.join(" ") : "0";
  }

  static calculateTotalBaseTime(timeValues: Record<string, number>, timeUnits: TimeUnit[]): number {
    let total = 0;
    for (const [unitId, amount] of Object.entries(timeValues)) {
      const unit = timeUnits.find((u) => u.id === unitId);
      if (unit) {
        total += (Number(amount) || 0) * unit.ratio;
      }
    }
    return total;
  }
}
