import { MODULE_ID } from "@/global.js";
import { Logger } from "@/core/logger.js";
import { getGame, getUI } from "@/core/foundry.js";

type V1_2SystemRules = {
  method?: string;
  critDoubleStrategy?: "any" | "all" | "never";
  critThreshold?: number;
};

export async function migrateToV1_2() {
  getUI()?.notifications?.info("Downtime Engine: Performing v1.2.0 migration (Critical Rules)...");

  try {
    const game = getGame();
    const rules = (game.settings.get(MODULE_ID, "rules") as unknown as V1_2SystemRules) || {
      method: "roll",
    };
    let changed = false;
    const updatedRules: V1_2SystemRules = { ...rules };

    if (updatedRules.critDoubleStrategy === undefined) {
      updatedRules.critDoubleStrategy = "never";
      changed = true;
    }
    if (updatedRules.critThreshold === undefined) {
      updatedRules.critThreshold = 20;
      changed = true;
    }

    if (changed) {
      // Cast to any is necessary because the settings API expects the shape registered at runtime.
      await game.settings.set(MODULE_ID, "rules", updatedRules as any);
      getUI()?.notifications?.info("Critical hit rules migrated successfully!");
    }
  } catch (error) {
    Logger.error("migration to v1.2.0 failed:", true, error);
    throw error;
  }
}
