import { MODULE_ID } from "../global";
import { Logger } from "../core/logger.js";

interface LegacyRules {
  method?: string;
  nonBulkMethod?: string;
  bulkMethod?: string;
  [key: string]: any;
}

/**
 * Helper to migrate strict equality operators to loose ones.
 * Returns an object with the new requirements array and a boolean indicating if changes were made.
 * Does not mutate the original array.
 */
function migrateRequirementOperators(requirements: any[]): {
  newRequirements: any[];
  changed: boolean;
} {
  if (!Array.isArray(requirements)) return { newRequirements: [], changed: false };
  let changed = false;
  const newRequirements = requirements.map((req) => {
    if (req.operator === "===") {
      changed = true;
      return { ...req, operator: "==" };
    } else if (req.operator === "!==") {
      changed = true;
      return { ...req, operator: "!=" };
    }
    return req;
  });
  return { newRequirements, changed };
}

/**
 * Migration v2.1:
 * 1. Splits the single 'method' rule into 'nonBulkMethod' and 'bulkMethod'.
 * 2. Migrates strict comparison operators (===, !==) to loose ones (==, !=) in requirements.
 */
export async function migrateToV2_1() {
  ui.notifications?.info("Downtime Engine: Performing v2.1.0 migration...");

  try {
    // 1. Rules Migration (Method split)
    const rules = game.settings.get(MODULE_ID, "rules") as unknown as LegacyRules;

    if (rules && rules.method && !rules.nonBulkMethod) {
      const oldMethod = rules.method;
      const updatedRules: any = { ...rules };

      delete updatedRules.method;

      if (oldMethod === "direct") {
        updatedRules.nonBulkMethod = "direct";
        updatedRules.bulkMethod = "direct";
      } else if (oldMethod === "roll") {
        updatedRules.nonBulkMethod = "roll";
        updatedRules.bulkMethod = "roll";
      } else if (oldMethod === "mathematical") {
        updatedRules.nonBulkMethod = "roll";
        updatedRules.bulkMethod = "mathematical";
      } else {
        updatedRules.nonBulkMethod = "direct";
        updatedRules.bulkMethod = "direct";
      }

      await game.settings.set(MODULE_ID, "rules", updatedRules);
    }

    // 2. Operator Migration: Project Templates in Settings
    let templates =
      (game.settings.get(MODULE_ID, "projectTemplates") as unknown as unknown[]) || [];
    if (!Array.isArray(templates)) {
      templates = [];
    }
    let templatesUpdated = false;

    const newTemplates = templates.map((tpl: any) => {
      const { newRequirements, changed } = migrateRequirementOperators(tpl.requirements);
      if (changed) {
        templatesUpdated = true;
        return { ...tpl, requirements: newRequirements };
      }
      return tpl;
    });

    if (templatesUpdated) {
      await game.settings.set(MODULE_ID, "projectTemplates", newTemplates);
    }

    // 3. Operator Migration: Actor Items
    const actors = Array.from(game.actors?.values() || []) as any[];
    for (const actor of actors) {
      const projects = actor.items.filter(
        (i: any) =>
          i.getFlag(MODULE_ID, "isLearningProject") || i.getFlag(MODULE_ID, "isLearnedReward"),
      );

      const updates: any[] = [];
      for (const item of projects) {
        const projectData = (item as any).getFlag(MODULE_ID, "projectData");
        if (projectData?.requirements) {
          const { newRequirements, changed } = migrateRequirementOperators(
            projectData.requirements,
          );
          if (changed) {
            updates.push({
              _id: item.id,
              [`flags.${MODULE_ID}.projectData.requirements`]: newRequirements,
            });
          }
        }
      }

      if (updates.length > 0) {
        await (actor as any).updateEmbeddedDocuments("Item", updates);
      }
    }

    // 4. Operator Migration: Items in Allowed Compendiums
    let allowedPacks =
      (game.settings.get(MODULE_ID, "allowedCompendiums") as unknown as string[]) || [];
    if (!Array.isArray(allowedPacks)) {
      allowedPacks = [];
    }
    let hasFailures = false;

    for (const packId of allowedPacks) {
      const pack = game.packs.get(packId);
      if (!pack || pack.metadata.type !== "Item") continue;

      const wasLocked = pack.locked;
      try {
        if (wasLocked) await pack.configure({ locked: false });

        const documents = await pack.getDocuments();
        const updates: any[] = [];
        for (const item of documents) {
          const projectData = (item as any).getFlag(MODULE_ID, "projectData");
          if (projectData?.requirements) {
            const { newRequirements, changed } = migrateRequirementOperators(
              projectData.requirements,
            );
            if (changed) {
              updates.push({
                _id: item.id,
                [`flags.${MODULE_ID}.projectData.requirements`]: newRequirements,
              });
            }
          }
        }

        if (updates.length > 0) {
          const DocumentClass = (pack as any).documentClass || (CONFIG as any).Item.documentClass;
          if (DocumentClass) {
            await DocumentClass.updateDocuments(updates, { pack: pack.collection });
          } else {
            throw new Error(`Could not resolve DocumentClass for pack ${packId}`);
          }
        }
      } catch (err) {
        Logger.error(`Failed to migrate compendium pack ${packId}:`, err);
        hasFailures = true;
      } finally {
        if (wasLocked) {
          try {
            await pack.configure({ locked: true });
          } catch (lockErr) {
            Logger.error(`Failed to re-lock compendium pack ${packId}:`, lockErr);
            hasFailures = true;
          }
        }
      }
    }

    if (hasFailures) {
      throw new Error("One or more compendium packs failed to migrate.");
    }

    await game.settings.set(MODULE_ID, "migrationVersion", "2.1.0");
    ui.notifications?.info("Downtime Engine: Migration to v2.1.0 complete.");
  } catch (err) {
    Logger.error("Migration to v2.1.0 failed:", err);
    ui.notifications?.error(
      "Downtime Engine: Migration to v2.1.0 failed. Check console for details.",
    );
    throw err;
  }
}

/**
 * Migration v2.1.1: Refreshes the bulk mathematical formula if it matches the old buggy default.
 */
export async function migrateToV2_1_1() {
  ui.notifications?.info("Downtime Engine: Migration v2.1.1 (Formula refresh)...");

  try {
    const rules = (game.settings.get(MODULE_ID, "rules") as any) || {};
    const oldBuggyDefault = "round(@hours * (22 - max(1, @dc - @abilities.int.mod)) / 20)";
    const newDefault = "round(@hours * (22 - max(1, @dc - (@abilities.int.mod + @tutelage))) / 20)";

    if (rules && rules.bulkExpectedFormula === oldBuggyDefault) {
      const updatedRules = { ...rules, bulkExpectedFormula: newDefault };
      await game.settings.set(MODULE_ID, "rules", updatedRules);
      ui.notifications?.info("Downtime Engine: Bulk mathematical formula updated to new default.");
    }

    await game.settings.set(MODULE_ID, "migrationVersion", "2.1.1");
  } catch (err) {
    Logger.error("Migration to v2.1.1 failed:", err);
    ui.notifications?.error(
      "Downtime Engine: Migration to v2.1.1 failed. Check console for details.",
    );
    throw err;
  }
}
