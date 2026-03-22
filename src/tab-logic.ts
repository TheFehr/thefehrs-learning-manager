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

    if (tu.isBulk) {
      progressGained = tier?.progress?.[tu.id] || 0;
      if (progressGained === 0) {
        reason = `Tutelage tier "${tier?.name || "None"}" provides no progress for ${tu.name}s.`;
      }
      console.debug("Downtime Engine | Bulk Progress:", {
        unitId: tu.id,
        tierProgress: tier?.progress,
        gained: progressGained,
      });
    } else if (rules.method === "roll" && rules.checkFormula) {
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
            if (d20s.some((die) => die.results?.some((r) => r.result >= threshold))) multiplier = 2;
          } else if (strategy === "all") {
            if (d20s.every((die) => die.results?.every((r) => r.result >= threshold)))
              multiplier = 2;
          }
        }
      }

      if (roll.total >= (rules.checkDC || 0)) {
        progressGained = 1 * multiplier;
      } else {
        reason = `Roll total ${roll.total} failed to meet DC ${rules.checkDC}.`;
      }
    } else {
      progressGained = 1;
    }
    return { progressGained, roll, reason };
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
      switch (op) {
        case "===":
          met = String(actorValue) === String(targetValue);
          break;
        case "!==":
          met = String(actorValue) !== String(targetValue);
          break;
        case ">":
          met = Number(actorValue) > Number(targetValue);
          break;
        case ">=":
          met = Number(actorValue) >= Number(targetValue);
          break;
        case "<":
          met = Number(actorValue) < Number(targetValue);
          break;
        case "<=":
          met = Number(actorValue) <= Number(targetValue);
          break;
        case "includes":
          if (Array.isArray(actorValue)) {
            met = actorValue.includes(targetValue);
          } else if (typeof actorValue === "string") {
            met = actorValue.includes(String(targetValue));
          } else {
            met = false;
          }
          break;
      }
      if (!met) return { eligible: false, reason: `${req.attribute} ${op} ${req.value}` };
    }
    return { eligible: true, reason: "" };
  }

  static formatTimeBank(totalUnits: number, timeUnits: TimeUnit[]): string {
    if (totalUnits === 0) return "0";

    const isNegative = totalUnits < 0;
    let remaining = Math.abs(totalUnits);
    const sorted = [...timeUnits].sort((a, b) => b.ratio - a.ratio);
    const parts: string[] = [];

    for (const unit of sorted) {
      const count = Math.floor(remaining / unit.ratio);
      if (count > 0) {
        parts.push(`${count}${unit.short}`);
        remaining %= unit.ratio;
      }
    }

    const formatted = parts.length > 0 ? parts.join(" ") : "0";
    return isNegative ? `-${formatted}` : formatted;
  }
}
