import { ProjectEngine } from "../project-engine.js";
import type { Actor5e, Item5e, SystemRules, GuidanceTier } from "../types.js";
import { createProjectItemFromTemplate, type LegacyProject } from "./migration-utils.js";

interface ProjectTemplateLegacy {
  id: string;
  name: string;
  target: number;
  rewardUuid: string;
  rewardType: string;
  requirements: unknown[];
}

export async function migrateToV2Direct() {
  const SETTINGS_ID = "thefehrs-learning-manager";
  ui.notifications?.info("Downtime Engine: Performing direct migration to v2.0.0...");
  try {
    // 1. Rules Migration (v3 equivalent)
    const rules = game.settings.get(SETTINGS_ID, "rules") as unknown as SystemRules;
    if (rules && !rules.critDoubleStrategy) {
      const updatedRules = {
        ...rules,
        critDoubleStrategy: "never" as const,
        critThreshold: 10,
      };
      await game.settings.set(SETTINGS_ID, "rules", updatedRules);
    }

    // 2. Guidance Tiers Migration (v2 equivalent)
    const tiers = game.settings.get(SETTINGS_ID, "guidanceTiers") as unknown as GuidanceTier[];
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
    const library =
      (game.settings.get(SETTINGS_ID, "projectTemplates") as unknown as ProjectTemplateLegacy[]) ||
      [];
    let libraryUpdated = false;
    const actors = (game.actors || []) as Actor[];

    let allSuccessful = true;
    for (const actor of actors) {
      const projects = (actor.getFlag(SETTINGS_ID, "projects" as any) || []) as LegacyProject[];
      if (projects.length === 0) continue;

      const remainingProjects: LegacyProject[] = [];
      for (const p of projects) {
        // Find or create template (v1 logic)
        let tpl = library.find(
          (t) =>
            t.id === p.templateId ||
            (t.name === p.name &&
              t.target === (p.maxProgress ?? 100) &&
              t.rewardUuid === (p.rewardUuid || "") &&
              t.rewardType === (p.rewardType || "item")),
        );

        if (!tpl) {
          tpl = {
            id: (foundry.utils as unknown as { randomID: () => string }).randomID(),
            name: p.name || "Unknown Project",
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
          name: p.name || tpl.name,
          templateId: tpl.id,
          progress: p.progress || 0,
          target: p.target ?? tpl.target,
          tutelageId: p.guidanceTierId || "",
          isCompleted: p.isCompleted || false,
        };

        const created = await createProjectItemFromTemplate(
          actor as unknown as Actor5e,
          tpl.rewardUuid,
          projectData,
          tpl.target,
        );
        if (!created) {
          console.warn(
            `Downtime Engine | Migration: Failed to migrate project ${p.name || p.id} for actor ${actor.name}. Project will be preserved in legacy flags.`,
          );
          remainingProjects.push(p);
          allSuccessful = false;
        }
      }

      // Update legacy projects flag with only those that failed to migrate
      await actor.setFlag(SETTINGS_ID, "projects" as any, remainingProjects);
    }

    if (libraryUpdated) {
      await game.settings.set(SETTINGS_ID, "projectTemplates", library);
    }

    if (allSuccessful) {
      await game.settings.set(SETTINGS_ID, "migrationVersion", "2.0.0");
      ui?.notifications?.info("Downtime Engine direct migration to v2.0.0 successful!");
    } else {
      ui?.notifications?.warn(
        "Downtime Engine | Direct migration partially failed. Some projects were preserved in legacy flags and will be retried later.",
      );
    }
  } catch (error) {
    console.error("Downtime Engine direct migration failed:", error);
    ui?.notifications?.error(
      "Downtime Engine direct migration failed. Please check the console for details.",
    );
    throw error;
  }
}
