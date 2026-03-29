import { Settings } from "../core/settings.js";
import type { SystemRules } from "../types.js";

/**
 * Migration v2.1: Splits the single 'method' rule into 'nonBulkMethod' and 'bulkMethod'.
 */
export async function migrateToV2_1() {
  ui.notifications?.info("Downtime Engine: Migrating to flexible training methods (v2.1.0)...");

  try {
    const rules = Settings.get("rules") as any;

    // Check if migration is needed (if method exists and new fields don't)
    if (rules && rules.method && !rules.nonBulkMethod) {
      const oldMethod = rules.method;
      const updatedRules: SystemRules = { ...rules };

      // Remove deprecated field (clean up for type safety, though it's already in 'as any' above)
      delete (updatedRules as any).method;

      if (oldMethod === "direct") {
        updatedRules.nonBulkMethod = "direct";
        updatedRules.bulkMethod = "direct";
      } else if (oldMethod === "roll") {
        updatedRules.nonBulkMethod = "roll";
        updatedRules.bulkMethod = "roll";
      } else if (oldMethod === "mathematical") {
        updatedRules.nonBulkMethod = "roll";
        updatedRules.bulkMethod = "mathematical";
      }

      await Settings.set("rules", updatedRules);
    }

    await Settings.set("migrationVersion", "2.1.0");
    ui.notifications?.info("Downtime Engine: Migration to v2.1.0 complete.");
  } catch (err) {
    console.error("Downtime Engine | Migration to v2.1.0 failed:", err);
    ui.notifications?.error(
      "Downtime Engine: Migration to v2.1.0 failed. Check console for details.",
    );
    throw err;
  }
}
