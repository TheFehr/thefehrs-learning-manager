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
  // Snapshot current settings for potential rollback
  const originalSettings = {
    rules: Settings.rules,
    timeUnits: Settings.timeUnits,
    guidanceTiers: Settings.guidanceTiers,
    allowedCompendiums: Settings.allowedCompendiums,
  };

  try {
    await Settings.setRules(rules);
    await Settings.setTimeUnits(timeUnits);
    await Settings.setGuidanceTiers(guidanceTiers);
    await Settings.setAllowedCompendiums(allowedCompendiums);
    ui.notifications?.info("Downtime Engine | Settings saved successfully.");
  } catch (err) {
    console.error("Downtime Engine | Failed to save settings, rolling back:", err);

    // Rollback to original settings
    try {
      await Settings.setRules(originalSettings.rules);
      await Settings.setTimeUnits(originalSettings.timeUnits);
      await Settings.setGuidanceTiers(originalSettings.guidanceTiers);
      await Settings.setAllowedCompendiums(originalSettings.allowedCompendiums);
    } catch (rollbackErr) {
      console.error("Downtime Engine | Critical failure: Rollback also failed:", rollbackErr);
    }

    ui.notifications?.error(
      "Downtime Engine | Failed to save settings: " +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}

/**
 * Returns a list of available Item compendiums.
 */
export function getAvailablePacks() {
  return (game.packs as unknown as any[])
    .filter((pack) => (pack as any).metadata.type === "Item")
    .map((pack) => ({
      id: (pack as any).metadata.id,
      label: (pack as any).metadata.label,
    }));
}

/**
 * Validates and normalizes imported settings data.
 */
export function validateSettings(data: any) {
  const result: {
    rules?: SystemRules;
    timeUnits?: TimeUnit[];
    guidanceTiers?: GuidanceTier[];
    allowedCompendiums?: string[];
  } = {};

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return result;
  }

  // 1. Validate Rules
  if (data.rules && typeof data.rules === "object") {
    result.rules = {
      method: data.rules.method === "roll" ? "roll" : "direct",
      rollMode: typeof data.rules.rollMode === "string" ? data.rules.rollMode : "gmroll",
      checkDC: typeof data.rules.checkDC === "number" ? data.rules.checkDC : 10,
      checkFormula: typeof data.rules.checkFormula === "string" ? data.rules.checkFormula : "",
      critDoubleStrategy: ["any", "all", "never"].includes(data.rules.critDoubleStrategy)
        ? data.rules.critDoubleStrategy
        : "never",
      critThreshold: typeof data.rules.critThreshold === "number" ? data.rules.critThreshold : 20,
    };
  }

  // 2. Validate Time Units
  if (Array.isArray(data.timeUnits)) {
    result.timeUnits = data.timeUnits
      .filter((unit: any) => unit && typeof unit.id === "string")
      .map((unit: any) => ({
        id: unit.id,
        name: typeof unit.name === "string" ? unit.name : "New Unit",
        short: typeof unit.short === "string" ? unit.short : "u",
        isBulk: !!unit.isBulk,
        ratio: typeof unit.ratio === "number" ? unit.ratio : 1,
      }));
  }

  // 3. Validate Guidance Tiers
  if (Array.isArray(data.guidanceTiers)) {
    result.guidanceTiers = data.guidanceTiers
      .filter((tier: any) => tier && typeof tier.id === "string")
      .map((tier: any) => {
        const isPlainObject = (obj: any) =>
          obj !== null && typeof obj === "object" && !Array.isArray(obj);

        return {
          id: tier.id,
          name: typeof tier.name === "string" ? tier.name : "New Tier",
          modifier: typeof tier.modifier === "number" ? tier.modifier : 0,
          costs: isPlainObject(tier.costs) ? tier.costs : {},
          progress: isPlainObject(tier.progress) ? tier.progress : {},
          _migratedToV2: typeof tier._migratedToV2 === "boolean" ? tier._migratedToV2 : false,
        };
      });
  }

  // 4. Validate Allowed Compendiums
  if (Array.isArray(data.allowedCompendiums)) {
    result.allowedCompendiums = data.allowedCompendiums.filter(
      (compendium: any) => typeof compendium === "string",
    );
  }

  return result;
}
