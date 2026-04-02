type V1_2SystemRules = {
  method?: string;
  critDoubleStrategy?: "any" | "all" | "never";
  critThreshold?: number;
};

export async function migrateToV1_2() {
  const SETTINGS_ID = "thefehrs-learning-manager";
  ui.notifications?.info("Migrating Downtime Engine critical hit rules...");
  try {
    const rules = (game.settings.get(SETTINGS_ID, "rules") as unknown as V1_2SystemRules) || {
      method: "roll",
    };

    let changed = false;
    const updatedRules: V1_2SystemRules = { ...rules };

    if (updatedRules.critDoubleStrategy === undefined) {
      updatedRules.critDoubleStrategy = "never";
      changed = true;
    }

    if (updatedRules.critThreshold === undefined) {
      updatedRules.critThreshold = 10;
      changed = true;
    }

    if (changed) {
      await game.settings.set(
        SETTINGS_ID,
        "rules",
        updatedRules as unknown as import("../types.js").SystemRules,
      );
    }
    await game.settings.set(SETTINGS_ID, "migrationVersion", "1.2.0");
    ui?.notifications?.info("Downtime Engine critical hit rules migrated successfully!");
  } catch (error) {
    console.error("Downtime Engine migration to v1.2.0 failed:", error);
    ui?.notifications?.error("Migration to v1.2.0 failed. Please check the console for details.");
    throw error;
  }
}
