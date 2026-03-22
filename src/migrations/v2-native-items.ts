import { ProjectEngine } from "../project-engine.js";
import type { Actor5e, Item5e } from "../types.js";

interface LegacyProject {
  id?: string;
  name?: string;
  templateId?: string;
  progress?: number;
  maxProgress?: number;
  target?: number;
  rewardUuid?: string;
  rewardType?: string;
  guidanceTierId?: string;
  isCompleted?: boolean;
}

export async function migrateToV2() {
  const SETTINGS_ID = "thefehrs-learning-manager";
  ui.notifications?.info("Migrating Downtime Engine projects to native Items (v2.0.0)...");
  try {
    const compendiumLabel = "UDE Migration";
    const compendiumName = "ude-migration";
    const compendiumKey = `world.${compendiumName}`;

    let pack = game.packs.get(compendiumKey);
    if (!pack) {
      pack = await (CompendiumCollection as any).createCompendium({
        type: "Item",
        label: compendiumLabel,
        name: compendiumName,
      });
    }

    const templates =
      (game.settings.get(SETTINGS_ID, "projectTemplates") as unknown as any[]) || [];
    const actors = (game.actors || []) as Actor[];

    let migratedCount = 0;
    let totalProjects = 0;

    // Count for progress bar
    for (const actor of actors) {
      const projects = (actor.getFlag(SETTINGS_ID, "projects" as any) || []) as any[];
      totalProjects += projects.length;
    }

    for (const actor of actors) {
      // Step 1: Migrate legacy actor projects to Items
      const projects = (actor.getFlag(SETTINGS_ID, "projects" as any) || []) as LegacyProject[];

      if (projects.length > 0) {
        const remainingProjects: LegacyProject[] = [];
        for (const p of projects) {
          const tpl = templates.find((t: any) => t.id === p.templateId);
          let success = false;
          if (tpl) {
            p.target = p.maxProgress ?? tpl.target;
            const created = await createProjectItem(actor as unknown as Actor5e, tpl, p);
            if (created) {
              success = true;
            }
          }

          if (success) {
            migratedCount++;
            ui.notifications?.info(`Migrating projects: ${migratedCount}/${totalProjects}`, {
              progress: (migratedCount / totalProjects) as unknown as boolean,
            });
          } else {
            console.warn(
              `Downtime Engine | Migration: Failed to migrate project ${p.name || p.id} for actor ${actor.name}. Template found: ${!!tpl}. Project preserved.`,
            );
            remainingProjects.push(p);
          }
        }
        await actor.setFlag(SETTINGS_ID, "projects" as any, remainingProjects);
      }

      // Step 2: Ensure all existing Item-projects have targets
      const learningItems = actor.items.filter(
        (i) =>
          i.getFlag("thefehrs-learning-manager", "isLearningProject") ||
          i.getFlag("thefehrs-learning-manager", "isLearnedReward"),
      );

      for (const item of learningItems) {
        const item5e = item as unknown as Item5e;
        const projectData = item5e.getFlag("thefehrs-learning-manager", "projectData") as
          | LegacyProject
          | undefined;
        const isLearnedReward = item5e.getFlag("thefehrs-learning-manager", "isLearnedReward");
        const updates: Record<string, unknown> = {};

        if (projectData && typeof projectData.target === "undefined") {
          const tpl = templates.find((t: any) => t.id === projectData.templateId);
          if (tpl) {
            projectData.target = tpl.target;
            updates[`flags.${SETTINGS_ID}.projectData`] = projectData;
          }
        }

        if (!item5e.getFlag("tidy5e-sheet", "section" as any)) {
          updates["flags.tidy5e-sheet.section"] = isLearnedReward
            ? "Completed Learning"
            : "In-Progress Learning";
        }

        if (Object.keys(updates).length > 0) {
          await item5e.update(updates);
        }
      }
    }

    await game.settings.set(SETTINGS_ID, "migrationVersion", "2.0.0");
    ui?.notifications?.info(`Successfully migrated to v2.0.0!`);
  } catch (error) {
    console.error("Downtime Engine migration to v2.0.0 failed:", error);
    ui?.notifications?.error("Migration to v2.0.0 failed. Please check the console for details.");
    throw error;
  }
}

async function createProjectItem(
  actor: Actor5e,
  template: { rewardUuid: string; target: number },
  projectData: LegacyProject,
) {
  const rewardDoc = await fromUuid(template.rewardUuid as any);
  if (!rewardDoc || !(rewardDoc instanceof Item)) return null;

  const item5e = rewardDoc as unknown as Item5e;
  const itemData = item5e.toObject();
  const stashedEffects = itemData.effects || [];
  const stashedActivities = itemData.system.activities || {};
  const stashedType = itemData.type;

  const projectDataWithTarget = {
    ...projectData,
    target: projectData.target ?? template.target,
  };

  const updateData = {
    ...itemData,
    type: projectData.isCompleted ? stashedType : "feat",
    effects: [],
    "system.type.value": projectData.isCompleted
      ? (itemData.system as unknown as { type: { value: string } }).type?.value
      : "learning-project",
    "system.activities": {},
    "flags.thefehrs-learning-manager": {
      isLearningProject: !projectData.isCompleted,
      isLearnedReward: projectData.isCompleted,
      projectData: projectDataWithTarget,
      stashedEffects: stashedEffects,
      stashedActivities: stashedActivities,
      stashedType: stashedType,
    },
    "flags.tidy5e-sheet.section": projectData.isCompleted
      ? "Completed Learning"
      : "In-Progress Learning",
  };

  // @ts-expect-error - Complex embedded document data
  const [created] = await (actor as unknown as Actor).createEmbeddedDocuments("Item", [updateData]);
  if (!created) return null;

  const createdItem = created as unknown as Item;
  if (!projectData.isCompleted) {
    console.debug(`Downtime Engine | Migration: Injecting activities for ${createdItem.name}`);
    await ProjectEngine.injectActivities(
      createdItem as unknown as Item5e,
      projectDataWithTarget.target,
    );
  }

  return created;
}
