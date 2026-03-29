import { Settings, type SettingsSchema } from "../core/settings.js";
import { Logger } from "../core/notifications.js";
import type { SystemRules, TimeUnit, GuidanceTier, NotificationLevel } from "../types.js";

/**
 * Shared save logic for the Downtime Engine settings.
 */
export async function saveSettings(
  rules: SystemRules,
  timeUnits: TimeUnit[],
  guidanceTiers: GuidanceTier[],
  allowedCompendiums: string[],
  autoSpend?: boolean,
  autoSpendUnits?: string[],
) {
  const isGM = game.user?.isGM;

  // Define what we're trying to change
  const toSave: Partial<Record<keyof SettingsSchema, any>> = {};
  if (isGM) {
    toSave.rules = rules;
    toSave.timeUnits = timeUnits;
    toSave.guidanceTiers = guidanceTiers;
    toSave.allowedCompendiums = allowedCompendiums;
  }
  if (autoSpend !== undefined) toSave.autoSpend = autoSpend;
  if (autoSpendUnits !== undefined) toSave.autoSpendUnits = autoSpendUnits;

  // Snapshot current values for potential rollback
  const snapshot: Partial<Record<keyof SettingsSchema, any>> = {};
  for (const key of Object.keys(toSave) as (keyof SettingsSchema)[]) {
    snapshot[key] = Settings.get(key);
  }

  const savedKeys: (keyof SettingsSchema)[] = [];

  try {
    for (const [key, value] of Object.entries(toSave) as [keyof SettingsSchema, any][]) {
      await Settings.set(key, value);
      savedKeys.push(key);
    }
  } catch (err) {
    Logger.error("Failed to save settings, rolling back:", err);

    // Rollback only what was successfully saved
    for (const key of savedKeys.reverse()) {
      try {
        await Settings.set(key, snapshot[key]);
      } catch (rollbackErr) {
        Logger.error(`Failed to rollback setting "${key}":`, rollbackErr);
      }
    }

    Logger.error("Failed to save settings: " + (err instanceof Error ? err.message : String(err)));
    return;
  }

  Logger.info("Settings saved successfully.", true);
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
  const packs = (game.packs as any).contents as PackLike[];
  return packs
    .filter((pack) => pack.metadata.type === "Item")
    .map((pack) => ({
      id: pack.metadata.id,
      label: pack.metadata.label,
    }));
}

const isPlainObject = (obj: any) => obj !== null && typeof obj === "object" && !Array.isArray(obj);

const sanitizeNumericRecord = (obj: any) => {
  if (!isPlainObject(obj)) return null;
  return Object.entries(obj).reduce((acc: Record<string, number>, [key, val]) => {
    if (typeof val === "number" && Number.isFinite(val)) {
      acc[key] = val;
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

  if (!isPlainObject(data)) {
    return result;
  }

  // 1. Validate Rules
  if (isPlainObject(data.rules)) {
    result.rules = {
      method: ["roll", "direct", "mathematical"].includes(data.rules.method)
        ? data.rules.method
        : "direct",
      rollMode: typeof data.rules.rollMode === "string" ? data.rules.rollMode : "gmroll",
      checkDC: Number.isFinite(data.rules.checkDC) ? data.rules.checkDC : 10,
      checkFormula: typeof data.rules.checkFormula === "string" ? data.rules.checkFormula : "",
      critDoubleStrategy: ["any", "all", "never"].includes(data.rules.critDoubleStrategy)
        ? data.rules.critDoubleStrategy
        : "never",
      critThreshold: Number.isFinite(data.rules.critThreshold) ? data.rules.critThreshold : 20,
      bulkExpectedFormula:
        typeof data.rules.bulkExpectedFormula === "string"
          ? data.rules.bulkExpectedFormula
          : "round(@hours * (22 - max(1, @dc - @mod)) / 20)",
      notificationLevel: ["none", "error", "info", "debug"].includes(data.rules.notificationLevel)
        ? data.rules.notificationLevel
        : "info",
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
        isBulk: typeof unit.isBulk === "boolean" ? unit.isBulk : false,
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
        costs: sanitizeNumericRecord(tier.costs) ?? {},
        progress: sanitizeNumericRecord(tier.progress) ?? {},
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
