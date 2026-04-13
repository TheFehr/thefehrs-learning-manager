import { MODULE_ID } from "@/global.js";
import { Logger } from "@/core/logger.js";

declare module "fvtt-types/configuration" {
  interface SettingConfig {
    "thefehrs-learning-manager.guidanceTiers": any[];
  }
}

/**
 * Migration v1.1: Multiplies guidance tier costs by 100 (GP to CP conversion).
 */
export async function migrateV1_1GpToCp() {
  try {
    let tiers = (game.settings.get(MODULE_ID, "guidanceTiers") as unknown as any[]) || [];
    if (!Array.isArray(tiers)) {
      tiers = [];
    }
    let tiersUpdated = false;
    for (const tier of tiers) {
      if (tier._migratedToV2 && !tier._migratedGpToCp) {
        tier._migratedGpToCp = true;
        tiersUpdated = true;
      } else if (!tier._migratedGpToCp && tier.costs) {
        for (const key of Object.keys(tier.costs)) {
          tier.costs[key] = Math.round(tier.costs[key] * 100);
        }
        tier._migratedGpToCp = true;
        tiersUpdated = true;
      }
    }
    if (tiersUpdated) {
      await game.settings.set(MODULE_ID, "guidanceTiers", tiers);
    }
  } catch (error) {
    Logger.error("v1.1 migration failed:", error);
    throw error;
  }
}
