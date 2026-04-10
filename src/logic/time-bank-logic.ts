import type { TimeUnit } from "../types.js";
import type { ActorProxy } from "./actor-proxy.js";

/**
 * Logic for the Time Bank Bar component.
 */
export class TimeBankLogic {
  /**
   * Calculates the display value for a specific time unit based on total base units.
   */
  static getTimeValue(unit: TimeUnit, total: number, sortedUnits: TimeUnit[]) {
    let remaining = total;
    for (const sortedUnit of sortedUnits) {
      if (sortedUnit.id === unit.id) return Math.floor(remaining / sortedUnit.ratio);
      remaining %= sortedUnit.ratio;
    }
    return 0;
  }

  /**
   * Updates the actor's time bank based on a changed unit value.
   */
  static async updateTime(
    unit: TimeUnit,
    newValue: string,
    proxy: ActorProxy,
    bankTotal: number,
    sortedUnits: TimeUnit[],
  ) {
    if (newValue.trim() === "") {
      ui.notifications?.warn(`Downtime Engine | Invalid time value: ${newValue}`);
      return;
    }
    const val = Math.floor(Number(newValue));
    if (!Number.isFinite(val) || val < 0) {
      ui.notifications?.warn(`Downtime Engine | Invalid time value: ${newValue}`);
      return;
    }

    const currentVal = this.getTimeValue(unit, bankTotal, sortedUnits);
    const diff = (val - currentVal) * unit.ratio;
    const newTotal = bankTotal + diff;

    if (newTotal < 0) {
      ui.notifications?.warn("Downtime Engine | Time bank cannot be negative.");
      return;
    }

    try {
      if (diff !== 0) {
        await proxy.setBank({ total: newTotal });
      }
    } catch (err) {
      console.error("Downtime Engine | Failed to update time bank:", err);
      ui.notifications?.error(
        "Downtime Engine | Failed to update time bank. See console for details.",
      );
    }
  }
}
