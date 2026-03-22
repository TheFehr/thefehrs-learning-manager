export async function migrateToV1_1() {
  const SETTINGS_ID = "thefehrs-learning-manager";
  ui.notifications?.info("Migrating Downtime Engine guidance costs from gp to cp...");
  try {
    const tiers = game.settings.get(SETTINGS_ID, "guidanceTiers") as any[];
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
      await game.settings.set(SETTINGS_ID, "guidanceTiers", tiers);
    }
    await game.settings.set(SETTINGS_ID, "migrationVersion", "1.1.0");
    ui?.notifications?.info("Downtime Engine guidance costs migrated to cp successfully!");
  } catch (error) {
    console.error("Downtime Engine migration to v1.1.0 failed:", error);
    ui?.notifications?.error("Migration to v1.1.0 failed. Please check the console for details.");
    throw error;
  }
}
