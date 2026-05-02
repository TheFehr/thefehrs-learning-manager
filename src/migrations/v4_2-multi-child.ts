import { MODULE_ID } from "@/global.js";
import { Logger } from "@/core/logger.js";
import { getGame } from "@/core/foundry.js";

/**
 * Migration v4.2.0: Converts singular followUpProjectId to multiple followUpProjectIds array.
 */
export async function migrateToV4_2() {
  const game = getGame();
  Logger.info("Starting migration to v4.2.0 (Multi-child support)...");

  // 1. Migrate Actors in the world
  const actors = game.actors?.contents || [];
  for (const actor of actors) {
    const projects = (actor.items as any).filter((i: any) =>
      i.getFlag(MODULE_ID, "isLearningProject"),
    );

    for (const project of projects) {
      await migrateItem(project);
    }
  }

  // 2. Migrate Compendium Items
  const allowedCompendiums = (game.settings.get(MODULE_ID, "allowedCompendiums") as string[]) || [];
  for (const packId of allowedCompendiums) {
    const pack = (game as any).packs.get(packId);
    if (!pack || pack.locked) continue;

    const documents = await pack.getDocuments();
    for (const doc of documents) {
      if (doc.getFlag(MODULE_ID, "isLearningProject")) {
        await migrateItem(doc);
      }
    }
  }

  await game.settings.set(MODULE_ID, "migrationVersion", "4.2.0");
  Logger.info(`Migration to v4.2.0 complete. Internal version is now 4.2.0`);
}

async function migrateItem(item: any) {
  const projectData = item.getFlag(MODULE_ID, "projectData");
  if (!projectData) return;

  const legacyId = projectData.followUpProjectId;
  const currentIds = projectData.followUpProjectIds;

  // If we have a legacy ID and NO new array, migrate it
  if (legacyId && !Array.isArray(currentIds)) {
    Logger.info(`Migrating legacy follow-up for item: ${item.name} (${item.uuid})`);
    await item.update({
      [`flags.${MODULE_ID}.projectData.followUpProjectIds`]: [legacyId],
      [`flags.${MODULE_ID}.projectData.followUpProjectId`]: "",
    });
  } else if (legacyId !== undefined && legacyId !== "" && legacyId !== null) {
    // Already migrated or manual array exists, but legacy field is still cluttered. Clear it.
    await item.update({
      [`flags.${MODULE_ID}.projectData.followUpProjectId`]: "",
    });
  }
}
