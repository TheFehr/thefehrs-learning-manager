import { Settings } from "../core/settings.js";
import type { SystemRules, TimeUnit, GuidanceTier } from "../types.js";

/**
 * Shared save logic for the Downtime Engine settings.
 */
export async function saveSettings(
  rules: SystemRules,
  timeUnits: TimeUnit[],
  guidanceTiers: GuidanceTier[],
  allowedCompendiums: string[],
) {
  try {
    await Settings.setRules(rules);
    await Settings.setTimeUnits(timeUnits);
    await Settings.setGuidanceTiers(guidanceTiers);
    await Settings.setAllowedCompendiums(allowedCompendiums);
    ui.notifications?.info("Downtime Engine | Settings saved successfully.");
  } catch (err) {
    console.error("Downtime Engine | Failed to save settings:", err);
    ui.notifications?.error(
      "Downtime Engine | Failed to save settings: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}
