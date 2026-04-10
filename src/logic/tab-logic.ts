import { DEFAULT_DC } from "../global.js";
import { ActorProxy } from "./actor-proxy.js";
import { isActor5e } from "../types.js";
import type {
  LearningActor,
  TimeUnit,
  ProjectRequirement,
  ComparisonOperator,
  SystemRules,
  GuidanceTier,
  Actor5e,
} from "../types.js";

/**
 * Utility class for downtime resolution logic.
 * Tested against Foundry VTT v12.
 */
export class TabLogic {
  static async computeProgress(
    actor: LearningActor,
    rules: SystemRules,
    tier: GuidanceTier | undefined,
    tu: TimeUnit,
    options: { preview?: boolean } = {},
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

      if (options.preview) {
        const prob = await this.calculateSuccessProbability(actor, rules, tier);
        // If bulk, show expected progress for the one roll.
        // If separate rolls, it's handled differently by the dialog,
        // but for bulk preview we assume one roll.
        progressGained = Number((1 * prob).toFixed(2));
      } else {
        try {
          roll = await new Roll(
            rules.checkFormula,
            {
              ...actor.getRollData(),
              tutelage: tier?.modifier || 0,
            },
            // @ts-expect-error - Foundry Roll constructor accepts target in options
            { target: rules.checkDC },
          ).evaluate();
        } catch (err) {
          return {
            progressGained: 0,
            reason: `Invalid check formula: ${err instanceof Error ? err.message : String(err)}`,
          };
        }

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

        if (roll.total >= (rules.checkDC ?? DEFAULT_DC)) {
          progressGained = 1 * multiplier;
        } else {
          reason = `Roll total ${roll.total} failed to meet DC ${rules.checkDC ?? DEFAULT_DC}.`;
        }
      }
    } else if (effectiveMethod === "mathematical") {
      const hours = tu.ratio;
      const tutelageMod = tier?.modifier || 0;
      const dc = rules.checkDC ?? DEFAULT_DC;
      const bulkFormula =
        rules.bulkExpectedFormula ||
        "round(@hours * (22 - max(1, @dc - (@abilities.int.mod + @tutelage))) / 20)";

      const formulaData = {
        ...actor.getRollData(),
        tutelage: tutelageMod,
        hours: hours,
        dc: dc,
      };

      try {
        const expectedRoll = await new Roll(bulkFormula, formulaData).evaluate();
        const total = expectedRoll.total;

        if (!Number.isFinite(total)) {
          console.warn("Downtime Engine | Bulk mathematical formula produced non-finite result:", {
            bulkFormula,
            formulaData,
            total,
          });
          progressGained = 0;
          reason = "Bulk mathematical formula produced an invalid result.";
        } else {
          progressGained = Math.max(0, total);
        }

        console.debug("Downtime Engine | Bulk Expected Progress calculation details:", {
          bulkFormula,
          formulaData,
          result: total,
          progressGained,
        });
      } catch (err) {
        console.error("Downtime Engine | Failed to evaluate bulk mathematical formula:", {
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
   * Calculates the success probability (0-1) for a training roll.
   * Supports any formula containing a single simple d20 term.
   */
  static async calculateSuccessProbability(
    actor: LearningActor,
    rules: SystemRules,
    tier: GuidanceTier | undefined,
  ): Promise<number> {
    if (!rules.checkFormula) return 0;

    try {
      const rollData = {
        ...actor.getRollData(),
        tutelage: tier?.modifier || 0,
      };

      // 1. Construct the roll and evaluate it once to resolve data references
      const roll = new Roll(rules.checkFormula, rollData);
      await roll.evaluate();
      const dice = roll.dice;

      // 2. Handle the deterministic case (no dice)
      if (dice.length === 0) {
        return roll.total >= (rules.checkDC ?? DEFAULT_DC) ? 1 : 0;
      }

      // 3. Brute force outcomes by forcing the d20 result (1-20).
      // We only support formulas with exactly one d20 term and no other dice.
      const isSimpleD20 =
        dice.length === 1 &&
        dice[0].faces === 20 &&
        dice[0].number === 1 &&
        (dice[0].modifiers?.length || 0) === 0;

      if (!isSimpleD20) {
        console.debug(
          "Downtime Engine | Success probability estimation skipped: formula is complex or contains multiple dice.",
          rules.checkFormula,
        );
        return 0;
      }

      // Use non-global, case-insensitive, word-boundary regex to replace the d20 token
      const baseFormula = rules.checkFormula.replace(/\b1?d20\b/i, "Outcome");

      const outcomes = await Promise.all(
        Array.from({ length: 20 }, (_, idx) => {
          const i = idx + 1;
          const formula = baseFormula.replace("Outcome", String(i));
          const testRoll = new Roll(formula, rollData);
          return testRoll.evaluate();
        }),
      );

      const totalSuccesses = outcomes.filter(
        (r) => r.total >= (rules.checkDC ?? DEFAULT_DC),
      ).length;
      return totalSuccesses / 20;
    } catch (err) {
      console.error("Downtime Engine | Failed to calculate success probability:", err);
      return 0;
    }
  }

  /**
   * Deducts currency from an actor.
   */
  static async deductCurrency(actor: Actor, costCp: number): Promise<boolean> {
    if (isNaN(costCp) || costCp < 0) {
      console.warn(
        `Downtime Engine | Invalid currency cost: ${costCp}. Must be a non-negative number.`,
      );
      return false;
    }
    if (!isActor5e(actor)) {
      console.warn("Downtime Engine | Cannot deduct currency from non-dnd5e actor.");
      return false;
    }
    const proxy = ActorProxy.forActor(actor);
    const cur = proxy.currency;
    const totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (totalCp < costCp) {
      ui.notifications?.warn("Downtime Engine | Insufficient currency!");
      return false;
    }

    let remaining = totalCp - costCp;
    const newGp = Math.floor(remaining / 100);
    remaining %= 100;
    const newSp = Math.floor(remaining / 10);
    const newCp = remaining % 10;

    await proxy.updateCurrency({ gp: newGp, sp: newSp, cp: newCp });
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
      const actorValue = foundry.utils.getProperty(actor, req.attribute);
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
          console.warn(
            `Downtime Engine | Unknown operator "${op}" in requirement for attribute "${req.attribute}".`,
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
