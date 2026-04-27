import { MODULE_ID } from "@/global.js";
import { Logger } from "@/core/logger.js";
import { createProjectItemFromTemplate, type LegacyProject } from "./migration-utils.js";
import { getGame, getUI } from "@/core/foundry.js";

export async function migrateToV2() {
  let game: ReturnType<typeof getGame>;
  try {
    game = getGame();
  } catch (err) {
    Logger.error("Migration v2 | Foundry not ready (game is undefined).");
    return;
  }

  getUI()?.notifications?.info("Migrating Downtime Engine projects to native Items (v2.0.0)...");
  try {
    const compendiumLabel = "UDE Migration";
    const compendiumName = "ude-migration";
    const compendiumKey = `world.${compendiumName}`;

    let pack = game.packs?.get(compendiumKey);
    if (!pack) {
      pack = await (CompendiumCollection as any).createCompendium({
        type: "Item",
        label: compendiumLabel,
        name: compendiumName,
      });
    }

    const templates = (game.settings.get(MODULE_ID, "projectTemplates") as unknown as any[]) || [];
    const actors = (game.actors?.contents || []) as Actor[];

    let migratedCount = 0;
    let processedCount = 0;
    let totalProjects = 0;
    let allSuccessful = true;

    // Count for progress bar
    for (const actor of actors) {
      const projects = (actor.getFlag(MODULE_ID, "projects" as any) as any[]) || [];
      totalProjects += projects.length;
    }

    const notification =
      totalProjects > 0
        ? getUI()?.notifications?.info(`Migrating projects: 0/${totalProjects}`, {
            progress: true,
          })
        : null;

    for (const actor of actors) {
      // Step 1: Migrate legacy actor projects to Items
      const projects = (actor.getFlag(MODULE_ID, "projects" as any) as any[]) || [];

      if (projects.length > 0) {
        const remainingProjects: LegacyProject[] = [];
        for (const p of projects) {
          processedCount++;
          const tpl = templates.find((t: any) => t.id === p.templateId);
          let success = false;
          if (tpl) {
            p.target = p.maxProgress ?? tpl.target;
            p.name = p.name || tpl.name; // Carry over template name if missing

            // Archive to Compendium if not already there
            if (pack) {
              const existingInPack = p.name ? pack.index?.getName(p.name) : null;
              if (!existingInPack && p.name) {
                Logger.debug(`Archiving project "${p.name}" to compendium.`);
              }
            }

            const created = await createProjectItemFromTemplate(
              actor as any,
              tpl.rewardUuid,
              p,
              tpl.target,
            );
            if (created) {
              success = true;
              // Push to pack if successful and not already there
              if (pack && pack.index && !pack.index.getName(created.name)) {
                await (pack as any).importDocument(created);
              }
            }
          }

          if (success) {
            migratedCount++;
          } else {
            Logger.warn(
              `Migration: Failed to migrate project ${p.name || p.id} for actor ${actor.name}. Template found: ${!!tpl}. Project preserved.`,
              false,
            );
            remainingProjects.push(p);
            allSuccessful = false;
          }

          if (notification) {
            getUI()?.notifications?.update(notification, {
              message: `Migrating projects: ${processedCount}/${totalProjects}`,
              pct: processedCount / totalProjects,
            });
          }
        }
        await actor.setFlag(MODULE_ID, "projects" as any, remainingProjects);
      }

      // Step 2: Ensure all existing Item-projects have targets
      const learningItems = actor.items.filter(
        (i: any) =>
          i.getFlag(MODULE_ID, "isLearningProject") || i.getFlag(MODULE_ID, "isLearnedReward"),
      );

      for (const item of learningItems) {
        const item5e = item as any;
        const projectData = item5e.getFlag(MODULE_ID, "projectData") as LegacyProject | undefined;
        const isLearnedReward = item5e.getFlag(MODULE_ID, "isLearnedReward");
        const updates: Record<string, unknown> = {};

        if (projectData && typeof projectData.target === "undefined") {
          const tpl = templates.find((t: any) => t.id === projectData.templateId);
          if (tpl) {
            projectData.target = tpl.target;
            updates[`flags.${MODULE_ID}.projectData`] = projectData;
          }
        }

        if (!item5e.getFlag("tidy5e-sheet", "section")) {
          updates["flags.tidy5e-sheet.section"] = isLearnedReward
            ? "Completed Learning"
            : "In-Progress Learning";
        }

        if (Object.keys(updates).length > 0) {
          await item5e.update(updates);
        }
      }
    }

    if (allSuccessful) {
      await game.settings.set(MODULE_ID, "migrationVersion", "2.0.0");
      getUI()?.notifications?.info(`Successfully migrated to v2.0.0!`);
    } else {
      if (notification) {
        getUI()?.notifications?.update(notification, {
          message: `Migration loop complete. ${migratedCount} projects successfully migrated.`,
          pct: 1,
        });
      }
      getUI()?.notifications?.warn(
        "Migration to native Items partially failed. Some projects were preserved in legacy flags and will be retried later.",
      );
    }
  } catch (error) {
    Logger.error("Migration to v2.0.0 failed:", false, error);
    getUI()?.notifications?.error(
      "Migration to v2.0.0 failed. Please check the console for details.",
    );
    throw error;
  }
}
