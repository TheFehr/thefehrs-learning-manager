import type { TimeUnit, Actor5e } from "../types.js";
import type { ActorProxy } from "../actor-proxy.js";

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
    const val = Number(newValue);
    if (!Number.isFinite(val) || Number.isNaN(val)) {
      ui.notifications?.warn(`Invalid time value: ${newValue}`);
      return;
    }

    const currentVal = this.getTimeValue(unit, bankTotal, sortedUnits);
    const diff = (val - currentVal) * unit.ratio;

    if (diff !== 0) {
      await proxy.setBank({ total: bankTotal + diff });
    }
  }
}
