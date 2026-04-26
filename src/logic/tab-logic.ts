import { getDieExpectation } from "./math-utils.js";
import { DEFAULT_DC } from "@/global.js";
import { ActorProxy } from "./actor-proxy.js";
import { Logger } from "@/core/logger.js";
import { FoundryUtils } from "@/core/foundry-utils.js";
import { isActor5e } from "@/types.js";
import type {
  LearningActor,
  TimeUnit,
  ProjectRequirement,
  ComparisonOperator,
  SystemRules,
  TrainingRoll,
} from "@/types.js";

import { getUI } from "@/core/foundry.js";

/**
 * Utility class for downtime resolution logic.
 * Tested against Foundry VTT v12.
 */
export class TabLogic {
  static async computeProgress(
    actor: LearningActor,
    rules: SystemRules,
    tutelageMod: number,
    tu: TimeUnit,
  ): Promise<{ progressGained: number; roll?: TrainingRoll; reason?: string }> {
    let progressGained = 0;
    let roll: TrainingRoll | undefined = undefined;
    let reason: string | undefined = undefined;

    const effectiveMethod = tu.isBulk ? rules.bulkMethod : rules.nonBulkMethod;
    const dc = Number(rules.checkDC ?? DEFAULT_DC);

    if (effectiveMethod === "direct") {
      progressGained = tu.ratio;
    } else if (effectiveMethod === "roll") {
      if (!rules.checkFormula) {
        return { progressGained: 0, reason: "No check formula defined in rules." };
      }

      try {
        roll = await new Roll(
          rules.checkFormula,
          {
            ...actor.getRollData(),
            tutelage: tutelageMod,
          },
          // @ts-expect-error - Foundry Roll constructor accepts target in options
          { target: dc },
        ).evaluate();
      } catch (err) {
        return {
          progressGained: 0,
          reason: `Invalid check formula: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      let multiplier = 1;
      const strategy = rules.critDoubleStrategy ?? "never";
      const threshold = Number(rules.critThreshold) || 20;

      if (strategy !== "never") {
        const d20s = (roll.dice ?? []).filter((die) => die.faces === 20);
        if (d20s.length > 0) {
          if (strategy === "any") {
            if (d20s.some((die) => die.results?.some((r) => r.active && r.result >= threshold)))
              multiplier = 2;
          } else if (strategy === "all") {
            if (
              d20s.every((die) => {
                const active = die.results?.filter((r) => r.active) ?? [];
                return active.length > 0 && active.every((r) => r.result >= threshold);
              })
            )
              multiplier = 2;
          }
        }
      }

      if ((roll.total || 0) >= dc) {
        progressGained = 1 * multiplier;
      } else {
        reason = `Roll total ${roll.total} failed to meet DC ${dc}.`;
      }
    } else if (effectiveMethod === "mathematical") {
      const hours = tu.ratio;

      let mod = 0;
      if (rules.checkFormula) {
        try {
          // Check for unsupported keep/drop dice expressions (e.g., 4d6kh3) that aren't the common 2d20kh1/kl1.
          // We can't easily calculate a deterministic expectation for these in a single pass.
          const hasUnsupportedModifiers = /\b\d*d\d+[^+\-*/\s]*([rex]|ms|min|max)\d*\b/i.test(
            rules.checkFormula,
          );

          if (hasUnsupportedModifiers) {
            Logger.warn(
              `Mathematical progress: Unsupported dice modifier (explode/reroll) in formula "${rules.checkFormula}". Falling back to average expectation.`,
            );
          }

          const modFormula = rules.checkFormula
            // Replace d20-based dice with their relative modifier to a flat d20 roll (E - 10.5).
            // This allows us to extract the "bonus" part of the formula for use in the bulk calculation.
            .replace(
              /\b(\d*)d20(?:([a-z]+)(\d+)?)?\b/gi,
              (match, countStr, modType, modValueStr) => {
                const count = countStr ? parseInt(countStr) : 1;
                const modValue = modValueStr ? parseInt(modValueStr) : undefined;
                const expectation = getDieExpectation(count, 20, modType, modValue);
                return (expectation - 10.5).toString();
              },
            )
            // Replace all other dice with their average/expected value to make the formula deterministic.
            .replace(
              /\b(\d*)d(\d+)(?:([a-z]+)(\d+)?)?\b/gi,
              (match, countStr, facesStr, modType, modValueStr) => {
                const count = countStr ? parseInt(countStr) : 1;
                const faces = parseInt(facesStr);
                const modValue = modValueStr ? parseInt(modValueStr) : undefined;
                const expectation = getDieExpectation(count, faces, modType, modValue);
                return expectation.toString();
              },
            );
          const modRoll = new Roll(modFormula, {
            ...actor.getRollData(),
            tutelage: tutelageMod,
          });
          const evaluatedMod = await modRoll.evaluate();
          mod = evaluatedMod.total || 0;
        } catch (err) {
          Logger.error("Failed to calculate mod for mathematical progress:", true, err);
          return {
            progressGained: 0,
            reason: `Invalid check formula: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }
      // The default bulk formula calculates progress based on success probability:
      // P(Success) = (22 - (DC - mod)) / 20, clamped between 1/20 and 1.
      // We multiply by @hours to get total expected progress.
      const bulkFormula =
        rules.bulkExpectedFormula || "round(@hours * (22 - max(1, @dc - @mod)) / 20)";

      const formulaData = {
        ...actor.getRollData(),
        tutelage: tutelageMod,
        hours: hours,
        dc: dc,
        mod: mod,
      };

      try {
        const expectedRoll = await new Roll(bulkFormula, formulaData).evaluate();
        const total = expectedRoll.total;

        if (!Number.isFinite(total)) {
          Logger.warn("Bulk mathematical formula produced non-finite result:", true, {
            bulkFormula,
            formulaData,
            total,
          });
          progressGained = 0;
          reason = "Bulk mathematical formula produced an invalid result.";
        } else {
          progressGained = Math.max(0, total);
        }

        Logger.debug("Bulk Expected Progress calculation details:", {
          bulkFormula,
          formulaData,
          result: total,
          progressGained,
        });
      } catch (err) {
        Logger.error("Failed to evaluate bulk mathematical formula:", true, {
          bulkFormula,
          formulaData,
          error: err,
        });
        progressGained = 0;
        reason = "Error evaluating bulk mathematical formula. Check console for details.";
      }
    }

    return { progressGained, roll, reason };
  }

  /**
   * Internal helper to brute-force all 20 outcomes of a d20-based check.
   */
  private static async _getOutcomes(
    actor: LearningActor,
    rules: SystemRules,
    tutelageMod: number,
  ): Promise<{ rolls: TrainingRoll[]; isDeterministic: boolean } | null> {
    if (!rules.checkFormula) return null;

    try {
      const rollData = {
        ...actor.getRollData(),
        tutelage: tutelageMod,
      };

      const roll = new Roll(rules.checkFormula, rollData) as TrainingRoll;
      await roll.evaluate();
      const dice = roll.dice;

      if (dice.length === 0) {
        return {
          rolls: Array.from({ length: 20 }, () => roll),
          isDeterministic: true,
        };
      }

      const d20Regex = /\b1?d20\b/gi;
      const baseFormula = rules.checkFormula.replace(d20Regex, "Outcome");
      const matchCount = (rules.checkFormula.match(d20Regex) || []).length;
      const isSimpleD20 =
        dice.length === 1 && dice[0].faces === 20 && dice[0].number === 1 && matchCount === 1;

      if (!isSimpleD20) return null;

      const rolls = await Promise.all(
        Array.from({ length: 20 }, (_, idx) => {
          const i = idx + 1;
          const formula = baseFormula.replace("Outcome", String(i));
          const testRoll = new Roll(formula, rollData) as TrainingRoll;
          return testRoll.evaluate();
        }),
      );
      return { rolls, isDeterministic: false };
    } catch (err) {
      Logger.error("Failed to calculate outcomes:", true, err);
      return null;
    }
  }

  /**
   * Calculates the statistically expected progress for a single training roll,
   * accounting for success DC and critDoubleStrategy.
   */
  static async calculateExpectedProgress(
    actor: LearningActor,
    rules: SystemRules,
    tutelageMod: number,
  ): Promise<number> {
    const res = await this._getOutcomes(actor, rules, tutelageMod);
    if (!res) return NaN;

    const { rolls, isDeterministic } = res;
    const strategy = rules.critDoubleStrategy ?? "never";
    const threshold = Number(rules.critThreshold) || 20;
    const dc = Number(rules.checkDC ?? DEFAULT_DC);

    let totalProgress = 0;
    rolls.forEach((r, idx) => {
      if ((r.total || 0) >= dc) {
        let multiplier = 1;
        if (!isDeterministic && strategy !== "never") {
          const rollValue = idx + 1;
          if (rollValue >= threshold) {
            multiplier = 2;
          }
        }
        totalProgress += multiplier;
      }
    });

    return totalProgress / 20;
  }

  /**
   * Calculates the success probability (0-1) for a training roll.
   * Supports any formula containing a single simple d20 term.
   */
  static async calculateSuccessProbability(
    actor: LearningActor,
    rules: SystemRules,
    tutelageMod: number,
  ): Promise<number | null> {
    const res = await this._getOutcomes(actor, rules, tutelageMod);
    if (!res) return null;
    const dc = Number(rules.checkDC ?? DEFAULT_DC);
    const successCount = res.rolls.filter((r) => (r.total || 0) >= dc).length;
    return successCount / 20;
  }

  /**
   * Deducts currency from an actor.
   */
  static async deductCurrency(actor: Actor, costCp: number): Promise<boolean> {
    if (isNaN(costCp) || costCp < 0) {
      Logger.warn(`Invalid currency cost: ${costCp}. Must be a non-negative number.`);
      return false;
    }
    if (!isActor5e(actor)) {
      Logger.warn("Cannot deduct currency from non-dnd5e actor.");
      return false;
    }
    const proxy = ActorProxy.forActor(actor);
    const cur = { ...proxy.currency };
    const totalCp =
      (cur.pp || 0) * 1000 +
      (cur.gp || 0) * 100 +
      (cur.ep || 0) * 50 +
      (cur.sp || 0) * 10 +
      (cur.cp || 0);

    if (totalCp < costCp) {
      getUI()?.notifications?.warn("Downtime Engine | Insufficient currency!");
      return false;
    }

    let remaining = costCp;
    const denoms = [
      { id: "pp", value: 1000 },
      { id: "gp", value: 100 },
      { id: "ep", value: 50 },
      { id: "sp", value: 10 },
      { id: "cp", value: 1 },
    ] as const;

    // 1. Drain from existing denominations, largest to smallest
    for (const d of denoms) {
      const available = cur[d.id] || 0;
      if (available > 0) {
        const canTake = Math.min(available, Math.floor(remaining / d.value));
        cur[d.id] = available - canTake;
        remaining -= canTake * d.value;
      }
    }

    // 2. If still remaining, we need to borrow/make change
    if (remaining > 0) {
      const canCover = denoms.filter((d) => (cur[d.id] || 0) > 0 && d.value > remaining).reverse();

      if (canCover.length > 0) {
        const d = canCover[0];
        cur[d.id] = (cur[d.id] || 0) - 1;
        let changeCp = d.value - remaining;
        remaining = 0;

        for (const cd of denoms) {
          if ((cd.id === "pp" || cd.id === "ep") && (proxy.currency[cd.id] || 0) === 0) continue;
          const toAdd = Math.floor(changeCp / cd.value);
          if (toAdd > 0) {
            cur[cd.id] = (cur[cd.id] || 0) + toAdd;
            changeCp %= cd.value;
          }
        }
      }
    }

    await proxy.updateCurrency(cur);
    return true;
  }

  /**
   * Adds currency to an actor.
   */
  static async addCurrency(actor: Actor, amountCp: number): Promise<boolean> {
    if (isNaN(amountCp) || amountCp < 0) {
      Logger.warn(`Invalid currency amount: ${amountCp}. Must be a non-negative number.`);
      return false;
    }
    if (!isActor5e(actor)) {
      Logger.warn("Cannot add currency to non-dnd5e actor.");
      return false;
    }
    const proxy = ActorProxy.forActor(actor);
    const cur = { ...proxy.currency };
    let remaining = amountCp;
    const denoms = [
      { id: "pp", value: 1000 },
      { id: "gp", value: 100 },
      { id: "ep", value: 50 },
      { id: "sp", value: 10 },
      { id: "cp", value: 1 },
    ] as const;

    for (const d of denoms) {
      if ((d.id === "pp" || d.id === "ep") && (cur[d.id] || 0) === 0) continue;
      const toAdd = Math.floor(remaining / d.value);
      if (toAdd > 0) {
        cur[d.id] = (cur[d.id] || 0) + toAdd;
        remaining %= d.value;
      }
    }

    await proxy.updateCurrency(cur);
    return true;
  }

  /**
   * Formats CP into a readable string (e.g. 1gp, 2sp, 5cp)
   */
  static formatCurrency(cp: number): string {
    if (cp === 0) return "0cp";
    const isNegative = cp < 0;
    const absCp = Math.abs(cp);

    const gp = Math.floor(absCp / 100);
    const sp = Math.floor((absCp % 100) / 10);
    const remainingCp = absCp % 10;

    const parts = [];
    if (gp > 0) parts.push(`${gp}gp`);
    if (sp > 0) parts.push(`${sp}sp`);
    if (remainingCp > 0 || parts.length === 0) parts.push(`${remainingCp}cp`);

    const formatted = parts.join(", ");
    return isNegative ? `-${formatted}` : formatted;
  }

  /**
   * Formats base training time into a readable string using available units.
   */
  static formatTimeBank(total: number, units: TimeUnit[]): string {
    if (total === 0) return "0";
    const sortedUnits = [...units].sort((a, b) => b.ratio - a.ratio);
    const result = [];
    let remaining = total;
    for (const unit of sortedUnits) {
      if (unit.ratio <= 0) continue;
      const count = Math.floor(remaining / unit.ratio);
      if (count > 0) {
        result.push(`${count}${unit.short}`);
        remaining %= unit.ratio;
      }
    }
    if (result.length > 0) return result.join(" ");

    // If total > 0 but it was too small to form a whole unit, show it as fractional smallest unit
    if (total > 0 && sortedUnits.length > 0) {
      const smallestUnit = sortedUnits[sortedUnits.length - 1];
      if (smallestUnit.ratio > 0) {
        const scaled = total / smallestUnit.ratio;
        // Show up to 2 decimal places, but remove trailing zeros
        return `${parseFloat(scaled.toFixed(2))}${smallestUnit.short}`;
      }
    }

    return "0";
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

  static meetsRequirements(
    actor: Actor,
    requirements: ProjectRequirement[],
  ): { eligible: boolean; reason: string } {
    for (const req of requirements) {
      const actorValue = FoundryUtils.getProperty(actor, req.attribute);
      const targetValue = req.value;
      const op: ComparisonOperator = req.operator;

      // Handle missing attributes explicitly
      if (actorValue === undefined || actorValue === null) {
        if (op === "!=") {
          // If both are missing/null, they ARE equal, so != is false
          if (targetValue === null || targetValue === undefined || targetValue === "") {
            return {
              eligible: false,
              reason: `Requirement not met: attribute "${req.attribute}" is missing and target value is also empty.`,
            };
          }
          // Attribute is missing but target has a value, so != is true. Proceed.
        } else {
          return {
            eligible: false,
            reason: `Requirement not met: attribute "${req.attribute}" not found on actor.`,
          };
        }
      }

      let met = false;
      // Note: == and != intentionally use loose equality for type coercion (e.g. "5" == 5)
      if (op === "==") met = actorValue == targetValue;
      else if (op === "!=") met = actorValue != targetValue;
      else if (op === "includes")
        met = Array.isArray(actorValue)
          ? actorValue.includes(targetValue)
          : String(actorValue).includes(String(targetValue));
      else {
        const aNum = Number(actorValue);
        const tNum = Number(targetValue);
        const isNumeric = !isNaN(aNum) && !isNaN(tNum);

        if (op === ">") met = isNumeric ? aNum > tNum : String(actorValue) > String(targetValue);
        else if (op === ">=")
          met = isNumeric ? aNum >= tNum : String(actorValue) >= String(targetValue);
        else if (op === "<")
          met = isNumeric ? aNum < tNum : String(actorValue) < String(targetValue);
        else if (op === "<=")
          met = isNumeric ? aNum <= tNum : String(actorValue) <= String(targetValue);
        else {
          Logger.warn(
            `Unknown operator "${op}" in requirement for attribute "${req.attribute}".`,
            true,
            {
              req,
              actorValue,
              targetValue,
            },
          );
          met = false;
        }
      }

      if (!met) {
        return {
          eligible: false,
          reason: `Requirement not met: ${req.attribute} (${actorValue}) ${op} ${targetValue}`,
        };
      }
    }
    return { eligible: true, reason: "" };
  }
}
