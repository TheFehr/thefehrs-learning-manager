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
    rules: structuredClone(Settings.rules),
    timeUnits: structuredClone(Settings.timeUnits),
    guidanceTiers: structuredClone(Settings.guidanceTiers),
    allowedCompendiums: structuredClone(Settings.allowedCompendiums),
  };

  let rulesUpdated = false;
  let timeUnitsUpdated = false;
  let guidanceTiersUpdated = false;
  let allowedCompendiumsUpdated = false;

  try {
    await Settings.setRules(rules);
    rulesUpdated = true;
    await Settings.setTimeUnits(timeUnits);
    timeUnitsUpdated = true;
    await Settings.setGuidanceTiers(guidanceTiers);
    guidanceTiersUpdated = true;
    await Settings.setAllowedCompendiums(allowedCompendiums);
    allowedCompendiumsUpdated = true;
  } catch (err) {
    console.error("Downtime Engine | Failed to save settings, rolling back:", err);

    // Rollback to original settings only for those that were successfully updated
    const rollback = async (fn: () => Promise<void>, label: string) => {
      try {
        await fn();
      } catch (rollbackErr) {
        console.error(`Downtime Engine | Rollback failed for ${label}:`, rollbackErr);
      }
    };

    if (rulesUpdated) await rollback(() => Settings.setRules(originalSettings.rules), "rules");
    if (timeUnitsUpdated)
      await rollback(() => Settings.setTimeUnits(originalSettings.timeUnits), "timeUnits");
    if (guidanceTiersUpdated)
      await rollback(
        () => Settings.setGuidanceTiers(originalSettings.guidanceTiers),
        "guidanceTiers",
      );
    if (allowedCompendiumsUpdated)
      await rollback(
        () => Settings.setAllowedCompendiums(originalSettings.allowedCompendiums),
        "allowedCompendiums",
      );

    ui.notifications?.error(
      "Downtime Engine | Failed to save settings: " +
        (err instanceof Error ? err.message : String(err)),
    );
    return;
  }

  ui.notifications?.info("Downtime Engine | Settings saved successfully.");
}

interface PackLike {
  metadata: {
    type: string;
    id: string;
    label: string;
  };
}

/**
 * Returns a list of available Item compendiums.
 */
export function getAvailablePacks() {
  const packs = game.packs as unknown as PackLike[];
  return packs
    .filter((pack) => pack.metadata.type === "Item")
    .map((pack) => ({
      id: pack.metadata.id,
      label: pack.metadata.label,
    }));
}

const isPlainObject = (obj: any) => obj !== null && typeof obj === "object" && !Array.isArray(obj);

const sanitizeNumericRecord = (obj: any) => {
  if (!isPlainObject(obj)) return {};
  return Object.entries(obj).reduce((acc: Record<string, number>, [key, val]) => {
    const num = Number(val);
    if (Number.isFinite(num)) {
      acc[key] = num;
    }
    return acc;
  }, {});
};

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
      checkDC: Number.isFinite(data.rules.checkDC) ? data.rules.checkDC : 10,
      checkFormula: typeof data.rules.checkFormula === "string" ? data.rules.checkFormula : "",
      critDoubleStrategy: ["any", "all", "never"].includes(data.rules.critDoubleStrategy)
        ? data.rules.critDoubleStrategy
        : "never",
      critThreshold: Number.isFinite(data.rules.critThreshold) ? data.rules.critThreshold : 20,
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
        ratio: Number.isFinite(unit.ratio) ? unit.ratio : 1,
      }));
  }

  // 3. Validate Guidance Tiers
  if (Array.isArray(data.guidanceTiers)) {
    result.guidanceTiers = data.guidanceTiers
      .filter((tier: any) => tier && typeof tier.id === "string")
      .map((tier: any) => ({
        id: tier.id,
        name: typeof tier.name === "string" ? tier.name : "New Tier",
        modifier: Number.isFinite(tier.modifier) ? tier.modifier : 0,
        costs: sanitizeNumericRecord(tier.costs),
        progress: sanitizeNumericRecord(tier.progress),
        _migratedToV2: typeof tier._migratedToV2 === "boolean" ? tier._migratedToV2 : false,
      }));
  }

  // 4. Validate Allowed Compendiums
  if (Array.isArray(data.allowedCompendiums)) {
    result.allowedCompendiums = data.allowedCompendiums.filter(
      (compendium: any) => typeof compendium === "string",
    );
  }

  return result;
}
