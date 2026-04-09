import { MODULE_ID } from "../global";

type V1_2SystemRules = {
  method?: string;
  critDoubleStrategy?: "any" | "all" | "never";
  critThreshold?: number;
};

export async function migrateToV1_2() {
  ui.notifications?.info("Downtime Engine: Performing v1.2.0 migration (Critical Rules)...");

  try {
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
      await game.settings.set(MODULE_ID, "rules", updatedRules as any);
      ui.notifications?.info("Critical hit rules migrated successfully!");
    }
  } catch (error) {
    console.error("Downtime Engine migration to v1.2.0 failed:", error);
    ui?.notifications?.error("Migration to v1.2.0 failed. Please check the console for details.");
    throw error;
  }
}
