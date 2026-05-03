import { DEFAULT_DC, MODULE_ID } from "@/global.js";
import { Settings, type SettingsSchema } from "@/core/settings.js";
import { Logger } from "@/core/logger.js";
import { FoundryUtils } from "@/core/foundry-utils.js";
import type { SystemRules, TimeUnit, NotificationLevel } from "@/types.js";
import { getGame } from "@/core/foundry.js";

/**
 * Shared save logic for the Downtime Engine settings.
 *
 * @param rules - The global system rules.
 * @param timeUnits - The available time units.
 * @param teacherCompendiums - List of actor compendiums to scan for instructors.
 * @param bookCompendiums - List of item compendiums to scan for books.
 * @param allowedCompendiums - List of item compendiums that can contain learnable projects.
 * @param autoSpend - Whether to automatically spend time from the bank.
 * @param autoSpendUnits - Which time units to auto-spend.
 * @returns {Promise<boolean>} True if settings were saved or nothing changed, false on error.
 */
export async function saveSettings(
  rules: SystemRules,
  timeUnits: TimeUnit[],
  teacherCompendiums: string[],
  bookCompendiums: string[],
  allowedCompendiums: string[],
  autoSpend?: boolean,
  autoSpendUnits?: string[],
  scanWorldActors?: boolean,
): Promise<boolean> {
  const isGM = !!getGame().user?.isGM;

  // Define what we're trying to change
  const toSave: Partial<Record<keyof SettingsSchema, any>> = {};
  if (isGM) {
    toSave.rules = rules;
    toSave.timeUnits = timeUnits;
    toSave.teacherCompendiums = teacherCompendiums;
    toSave.bookCompendiums = bookCompendiums;
    toSave.allowedCompendiums = allowedCompendiums;
    if (scanWorldActors !== undefined) toSave.scanWorldActors = scanWorldActors;
  }
  if (autoSpend !== undefined) toSave.autoSpend = autoSpend;
  if (autoSpendUnits !== undefined) toSave.autoSpendUnits = autoSpendUnits;

  if (Object.keys(toSave).length === 0) {
    Logger.info("No settings to save.");
    return true;
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
    Logger.error("Failed to save settings, rolling back:", true, err);

    // Rollback only what was successfully saved
    for (const key of [...savedKeys].reverse()) {
      try {
        await Settings.set(key, snapshot[key]);
      } catch (rollbackErr) {
        Logger.error(`Failed to rollback setting "${key}":`, true, rollbackErr);
      }
    }

    Logger.error(
      "Failed to save settings: " + (err instanceof Error ? err.message : String(err)),
      true,
    );
    return false;
  }

  Logger.info("Settings saved successfully.", true);
  return true;
}

/**
 * Checks if a category exists in the global list, and prompts the user to add it if it doesn't.
 */
export async function ensureCategoryExists(category: string): Promise<void> {
  if (!category) return;
  const normalizedCategory = category.trim();
  if (!normalizedCategory) return;

  const categories = Settings.get("categories") || [];
  if (categories.includes(normalizedCategory)) return;

  const escapedCategory = FoundryUtils.escapeHTML(normalizedCategory);
  const confirm = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Downtime Engine | New Category" },
    content: `<p>The category "<strong>${escapedCategory}</strong>" is not in the global list. Would you like to add it?</p>`,
    rejectClose: false,
    modal: true,
  });

  if (confirm) {
    const latestCategories = Settings.get("categories") || [];
    if (!latestCategories.includes(normalizedCategory)) {
      await Settings.set("categories", [...latestCategories, normalizedCategory]);
      Logger.info(`Added "${normalizedCategory}" to the global categories list.`, true);
    }
  }
}

export interface PackInfo {
  id: string;
  label: string;
  isFitting?: boolean;
}

/**
 * Returns a list of available compendiums of a given type.
 */
export async function getAvailablePacks(
  type: "Item" | "Actor" = "Item",
  flagToMatch?: string,
): Promise<PackInfo[]> {
  const packs = getGame().packs?.contents || [];
  const results: PackInfo[] = [];

  for (const pack of packs) {
    if (pack.metadata.type !== type && pack.documentName !== type) continue;

    const id = pack.metadata.id;
    const label = pack.metadata.label;
    let isFitting = false;

    // A pack is fitting if:
    // 1. We don't have a flag to match (then any pack of correct type is fitting)
    // 2. It contains items with the specified flag
    if (!flagToMatch) {
      isFitting = true;
    } else {
      try {
        // We only check the index, which is fast
        const flagPath = `flags.${MODULE_ID}.${flagToMatch}`;
        const index = await pack.getIndex({ fields: [flagPath] as any });
        isFitting = index.some((entry: Record<string, unknown>) => {
          const flagData = FoundryUtils.getProperty(entry, flagPath) || entry[flagPath];

          let hasFittingData = flagData !== undefined && flagData !== null;
          if (hasFittingData) {
            if (flagToMatch === "teacherOfferings") {
              hasFittingData = Array.isArray(flagData) && flagData.length > 0;
            } else if (flagToMatch === "learningBookBonus") {
              hasFittingData =
                typeof flagData === "object" && flagData !== null && "modifier" in flagData;
            }
          }

          if (hasFittingData) {
            Logger.debug(`Found fitting entry ${entry.name} in pack ${id}`);
          }
          return hasFittingData;
        });
      } catch (err) {
        Logger.warn(`Failed to check index for pack ${id}:`, true, err);
      }
    }

    results.push({ id, label, isFitting });
  }

  return results;
}

const isPlainObject = (obj: unknown): obj is Record<string, unknown> =>
  obj !== null && typeof obj === "object" && !Array.isArray(obj);

/**
 * Validates and normalizes imported settings data.
 */
export function validateSettings(data: unknown) {
  const result: {
    rules?: SystemRules;
    timeUnits?: TimeUnit[];
    teacherCompendiums?: string[];
    bookCompendiums?: string[];
    allowedCompendiums?: string[];
    categories?: string[];
    scanWorldActors?: boolean;
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
          : "round(@hours * (22 - max(1, @dc - (@mod))) / 20)",
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

  // 3. Validate Teacher Compendiums
  if (Array.isArray(data.teacherCompendiums)) {
    result.teacherCompendiums = data.teacherCompendiums.filter(
      (compendium: unknown): compendium is string => typeof compendium === "string",
    );
  }

  // 4. Validate Book Compendiums
  if (Array.isArray(data.bookCompendiums)) {
    result.bookCompendiums = data.bookCompendiums.filter(
      (compendium: unknown): compendium is string => typeof compendium === "string",
    );
  }

  // 5. Validate Allowed Compendiums
  if (Array.isArray(data.allowedCompendiums)) {
    result.allowedCompendiums = data.allowedCompendiums.filter(
      (compendium: unknown): compendium is string => typeof compendium === "string",
    );
  }

  // 6. Validate Categories
  if (Array.isArray(data.categories)) {
    result.categories = data.categories.filter(
      (category: unknown): category is string => typeof category === "string",
    );
  }

  // 7. Validate Scan World Actors
  if (typeof data.scanWorldActors === "boolean") {
    result.scanWorldActors = data.scanWorldActors;
  }

  return result;
}
