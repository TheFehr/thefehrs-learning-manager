import type { GuidanceTier } from "../types.js";

export async function migrateV1_1GpToCp() {
  const SETTINGS_ID = "thefehrs-learning-manager";
  try {
    const tiers = game.settings.get(
      SETTINGS_ID,
      "guidanceTiers" as any,
    ) as unknown as GuidanceTier[];
    let tiersUpdated = false;
    for (const tier of tiers) {
      if (!tier._migratedToV2 && tier.costs) {
        for (const key of Object.keys(tier.costs)) {
          tier.costs[key] = Math.round(tier.costs[key] * 100);
        }
        tier._migratedToV2 = true;
        tiersUpdated = true;
      }
    }
    if (tiersUpdated) {
      await game.settings.set(SETTINGS_ID, "guidanceTiers" as any, tiers);
    }
  } catch (error) {
    console.error("Downtime Engine v1.1 migration failed:", error);
    throw error;
  }
}
