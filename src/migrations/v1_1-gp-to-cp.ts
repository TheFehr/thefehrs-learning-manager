import { MODULE_ID } from "../global.js";

interface GuidanceTier {
  id: string;
  name: string;
  modifier: number;
  costs: Record<string, number>;
  progress: Record<string, number>;
  _migratedGpToCp?: boolean;
  _migratedToV2?: boolean;
}

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
    const tiers = (game.settings.get(MODULE_ID, "guidanceTiers") as unknown as any[]) || [];
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
    console.error("Downtime Engine v1.1 migration failed:", error);
    throw error;
  }
}
