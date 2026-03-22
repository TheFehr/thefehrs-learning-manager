import { ProjectEngine } from "../project-engine";

export async function migrateToV2() {
  const SETTINGS_ID = "thefehrs-learning-manager";
  ui.notifications?.info("Migrating Downtime Engine projects to native Items (v2.0.0)...");
  try {
    const compendiumLabel = "UDE Migration";
    const compendiumName = "ude-migration";
    const compendiumKey = `world.${compendiumName}`;

    let pack = game.packs.get(compendiumKey);
    if (!pack) {
      pack = (await (CompendiumCollection as any).createCompendium({
        type: "Item",
        label: compendiumLabel,
        name: compendiumName,
      })) as any;
    }

    const templates = (game.settings.get(SETTINGS_ID, "projectTemplates") as any[]) || [];
    const actors = (game.actors || []) as any[];

    let migratedCount = 0;
    let totalProjects = 0;

    // Count for progress bar
    for (const actor of actors) {
      const projects = (actor.getFlag(SETTINGS_ID, "projects") || []) as any[];
      totalProjects += projects.length;
    }

    for (const actor of actors) {
      // Step 1: Migrate legacy actor projects to Items
      const projects = (actor.getFlag(SETTINGS_ID, "projects") || []) as any[];

      if (projects.length > 0) {
        for (const p of projects) {
          const tpl = templates.find((t: any) => t.id === p.templateId);
          if (tpl) {
            p.target = p.target ?? tpl.target;
            await createProjectItem(actor, tpl, p);
          }
          migratedCount++;
          ui.notifications?.info(`Migrating projects: ${migratedCount}/${totalProjects}`, {
            progress: migratedCount / totalProjects,
          } as any);
        }
        await actor.setFlag(SETTINGS_ID, "projects", []);
      }

      // Step 2: Ensure all existing Item-projects have targets
      const learningItems = actor.items.filter(
        (i: any) =>
          i.getFlag(SETTINGS_ID, "isLearningProject") || i.getFlag(SETTINGS_ID, "isLearnedReward"),
      );

      for (const item of learningItems) {
        const projectData = item.getFlag(SETTINGS_ID, "projectData") as any;
        const isLearnedReward = item.getFlag(SETTINGS_ID, "isLearnedReward");
        const updates: any = {};

        if (projectData && typeof projectData.target === "undefined") {
          const tpl = templates.find((t: any) => t.id === projectData.templateId);
          if (tpl) {
            projectData.target = tpl.target;
            updates[`flags.${SETTINGS_ID}.projectData`] = projectData;
          }
        }

        if (!item.getFlag("tidy5e-sheet", "section")) {
          updates["flags.tidy5e-sheet.section"] = isLearnedReward
            ? "Completed Learning"
            : "In-Progress Learning";
        }

        if (Object.keys(updates).length > 0) {
          await item.update(updates);
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

async function createProjectItem(actor: any, template: any, projectData: any) {
  const SETTINGS_ID = "thefehrs-learning-manager";
  const rewardDoc = await fromUuid(template.rewardUuid);
  if (!rewardDoc || !(rewardDoc instanceof Item)) return null;

  const itemData = (rewardDoc as any).toObject();
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
    "system.type.value": projectData.isCompleted ? itemData.system.type?.value : "learningProject",
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

  const [created] = (await actor.createEmbeddedDocuments("Item", [updateData])) as any[];
  if (!created) return null;

  if (!projectData.isCompleted) {
    console.debug(`Downtime Engine | Migration: Injecting activities for ${created.name}`);
    await ProjectEngine.injectActivities(created as any, projectDataWithTarget.target);
  }

  return created;
}
