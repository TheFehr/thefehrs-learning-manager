export async function migrateToV1_2() {
  const SETTINGS_ID = "thefehrs-learning-manager";
  ui.notifications?.info("Migrating Downtime Engine critical hit rules...");
  try {
    const rules = (game.settings.get(SETTINGS_ID, "rules") as any) || { method: "roll" };
    if (!rules.critDoubleStrategy) {
      rules.critDoubleStrategy = "never";
      rules.critThreshold = 10;
      await game.settings.set(SETTINGS_ID, "rules", rules);
    }
    await game.settings.set(SETTINGS_ID, "migrationVersion", "1.2.0");
    ui?.notifications?.info("Downtime Engine critical hit rules migrated successfully!");
  } catch (error) {
    console.error("Downtime Engine migration to v1.2.0 failed:", error);
    ui?.notifications?.error("Migration to v1.2.0 failed. Please check the console for details.");
    throw error;
  }
}
