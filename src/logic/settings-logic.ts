import { DEFAULT_DC } from "../global.js";
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

  if (Object.keys(toSave).length === 0) {
    Logger.info("No settings to save.");
    return;
  }

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
    for (const key of [...savedKeys].reverse()) {
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
  const packs = (game.packs as unknown as { contents: PackLike[] }).contents;
  return packs
    .filter((pack) => pack.metadata.type === "Item")
    .map((pack) => ({
      id: pack.metadata.id,
      label: pack.metadata.label,
    }));
}

const isPlainObject = (obj: unknown): obj is Record<string, unknown> =>
  obj !== null && typeof obj === "object" && !Array.isArray(obj);

const sanitizeNumericRecord = (obj: unknown) => {
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
export function validateSettings(data: unknown) {
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
  const rawRules = data.rules as Record<string, unknown> | undefined;
  if (isPlainObject(rawRules)) {
    let nonBulkMethod = rawRules.nonBulkMethod as string | undefined;
    let bulkMethod = rawRules.bulkMethod as string | undefined;
    const legacyMethod = rawRules.method as string | undefined;

    // Map legacy method if new fields are missing
    if (legacyMethod && !nonBulkMethod && !bulkMethod) {
      if (legacyMethod === "direct") {
        nonBulkMethod = "direct";
        bulkMethod = "direct";
      } else if (legacyMethod === "roll") {
        nonBulkMethod = "roll";
        bulkMethod = "roll";
      } else if (legacyMethod === "mathematical") {
        nonBulkMethod = "roll";
        bulkMethod = "mathematical";
      }
    }

    result.rules = {
      nonBulkMethod: ["roll", "direct"].includes(String(nonBulkMethod))
        ? (nonBulkMethod as "roll" | "direct")
        : "direct",
      bulkMethod: ["roll", "direct", "mathematical"].includes(String(bulkMethod))
        ? (bulkMethod as "roll" | "direct" | "mathematical")
        : "direct",
      rollMode: typeof rawRules.rollMode === "string" ? rawRules.rollMode : "gmroll",
      checkDC: (() => {
        const raw = rawRules.checkDC;
        const num =
          typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "")
            ? Number(raw)
            : NaN;
        return Number.isFinite(num) ? num : DEFAULT_DC;
      })(),
      checkFormula: typeof rawRules.checkFormula === "string" ? rawRules.checkFormula : "",
      critDoubleStrategy: ["any", "all", "never"].includes(String(rawRules.critDoubleStrategy))
        ? (rawRules.critDoubleStrategy as "any" | "all" | "never")
        : "never",
      critThreshold: (() => {
        const raw = rawRules.critThreshold;
        const num =
          typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "")
            ? Number(raw)
            : NaN;
        return Number.isFinite(num) ? num : 20;
      })(),
      bulkExpectedFormula:
        typeof rawRules.bulkExpectedFormula === "string"
          ? rawRules.bulkExpectedFormula
          : "round(@hours * (22 - max(1, @dc - (@abilities.int.mod + @tutelage))) / 20)",
      notificationLevel: ["none", "error", "info", "debug"].includes(
        String(rawRules.notificationLevel),
      )
        ? (rawRules.notificationLevel as NotificationLevel)
        : "info",
    };
  }

  // 2. Validate Time Units
  if (Array.isArray(data.timeUnits)) {
    const filteredUnits = data.timeUnits.filter(
      (unit: unknown): unit is Record<string, unknown> =>
        isPlainObject(unit) && typeof unit.id === "string",
    );

    if (filteredUnits.length !== data.timeUnits.length) {
      Logger.warn(
        `Downtime Engine | Validation dropped ${data.timeUnits.length - filteredUnits.length} invalid time units.`,
      );
    }

    result.timeUnits = filteredUnits.map((unit) => ({
      id: String(unit.id),
      name: typeof unit.name === "string" ? unit.name : "New Unit",
      short: typeof unit.short === "string" ? unit.short : "u",
      isBulk: typeof unit.isBulk === "boolean" ? unit.isBulk : false,
      ratio: typeof unit.ratio === "number" && Number.isFinite(unit.ratio) ? unit.ratio : 1,
    }));
  }

  // 3. Validate Guidance Tiers
  if (Array.isArray(data.guidanceTiers)) {
    result.guidanceTiers = data.guidanceTiers
      .filter(
        (tier: unknown): tier is Record<string, unknown> =>
          isPlainObject(tier) && typeof tier.id === "string",
      )
      .map((tier) => ({
        id: String(tier.id),
        name: typeof tier.name === "string" ? tier.name : "New Tier",
        modifier:
          typeof tier.modifier === "number" && Number.isFinite(tier.modifier) ? tier.modifier : 0,
        costs: sanitizeNumericRecord(tier.costs) ?? {},
        progress: sanitizeNumericRecord(tier.progress) ?? {},
        _migratedToV2: typeof tier._migratedToV2 === "boolean" ? tier._migratedToV2 : false,
      }));
  }

  // 4. Validate Allowed Compendiums
  if (Array.isArray(data.allowedCompendiums)) {
    result.allowedCompendiums = data.allowedCompendiums.filter(
      (compendium: unknown): compendium is string => typeof compendium === "string",
    );
  }

  return result;
}
