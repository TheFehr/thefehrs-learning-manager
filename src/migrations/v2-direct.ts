export async function migrateToV2Direct() {
  const SETTINGS_ID = "thefehrs-learning-manager";
  ui.notifications?.info("Downtime Engine: Performing direct migration to v2.0.0...");
  try {
    const { ProjectEngine } = await import("../project-engine");

    // 1. Rules Migration (v3 equivalent)
    const rules = (game.settings.get(SETTINGS_ID, "rules") as any) || { method: "roll" };
    if (!rules.critDoubleStrategy) {
      rules.critDoubleStrategy = "never";
      rules.critThreshold = 10;
      await game.settings.set(SETTINGS_ID, "rules", rules);
    }

    // 2. Guidance Tiers Migration (v2 equivalent)
    const tiers = game.settings.get(SETTINGS_ID, "guidanceTiers") as any[];
    let tiersUpdated = false;
    for (const tier of tiers) {
      if (!tier._migratedToV2 && tier.costs) {
        for (const key of Object.keys(tier.costs)) {
          tier.costs[key] = Math.round(tier.costs[key] * 100);
        }
        tier._migratedToV2 = true;
        tiersUpdated = true;
      }
    }
    if (tiersUpdated) {
      await game.settings.set(SETTINGS_ID, "guidanceTiers", tiers);
    }

    // 3. Library and Item Migration (v1 + v4 + v5 equivalent)
    const library = (game.settings.get(SETTINGS_ID, "projectTemplates") as any[]) || [];
    let libraryUpdated = false;
    const actors = (game.actors || []) as any[];

    for (const actor of actors) {
      const projects = (actor.getFlag(SETTINGS_ID, "projects") || []) as any[];
      if (projects.length === 0) continue;

      for (const p of projects) {
        // Find or create template (v1 logic)
        let tpl = library.find(
          (t: any) =>
            t.id === p.templateId ||
            (t.name === p.name &&
              t.target === (p.maxProgress ?? 100) &&
              t.rewardUuid === (p.rewardUuid || "") &&
              t.rewardType === (p.rewardType || "item")),
        );

        if (!tpl) {
          tpl = {
            id: (foundry.utils as any).randomID(),
            name: p.name,
            target: p.maxProgress ?? 100,
            rewardUuid: p.rewardUuid || "",
            rewardType: p.rewardType || "item",
            requirements: [],
          };
          library.push(tpl);
          libraryUpdated = true;
        }

        // Create native Item from template and project data
        const projectData = {
          id: p.id,
          templateId: tpl.id,
          progress: p.progress || 0,
          target: p.target ?? tpl.target,
          guidanceTierId: p.guidanceTierId || "",
          isCompleted: p.isCompleted || false,
        };

        await createProjectItem(actor, tpl, projectData);
      }

      // Clear legacy projects from actor
      await actor.setFlag(SETTINGS_ID, "projects", []);
    }

    if (libraryUpdated) {
      await game.settings.set(SETTINGS_ID, "projectTemplates", library);
    }

    await game.settings.set(SETTINGS_ID, "migrationVersion", "2.0.0");
    ui?.notifications?.info("Downtime Engine direct migration to v2.0.0 successful!");
  } catch (error) {
    console.error("Downtime Engine direct migration failed:", error);
    ui?.notifications?.error("Direct migration failed. Please check the console for details.");
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
    const { ProjectEngine } = await import("../project-engine");
    await ProjectEngine.injectActivities(created as any, projectDataWithTarget.target);
  }
  return created;
}
