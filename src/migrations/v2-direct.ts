import { createProjectItemFromTemplate, type LegacyProject } from "./migration-utils.js";
import { MODULE_ID } from "@/global.js";
import { Logger } from "@/core/logger.js";
import { FoundryUtils } from "@/core/foundry-utils.js";

interface GuidanceTier {
  id: string;
  name: string;
  modifier: number;
  costs: Record<string, number>;
  progress: Record<string, number>;
  _migratedGpToCp?: boolean;
  _migratedToV2?: boolean;
}

declare module "fvtt-types/configuration" {
  interface SettingConfig {
    "thefehrs-learning-manager.guidanceTiers": any[];
  }
}

interface ProjectTemplateLegacy {
  id: string;
  name: string;
  target: number;
  rewardUuid: string;
  rewardType: string;
  requirements: unknown[];
}

export async function migrateToV2Direct() {
  ui.notifications?.info("Downtime Engine: Performing direct migration to v2.0.0...");

  try {
    // 1. Rules Migration (v3 equivalent)
    const rules = game.settings.get(MODULE_ID, "rules") as any;
    if (rules) {
      const updatedRules = {
        ...rules,
      };
      let rulesUpdated = false;

      const rawThreshold = updatedRules.critThreshold;
      const parsedThreshold = Number(rawThreshold);
      if (typeof rawThreshold !== "number") {
        updatedRules.critThreshold = Number.isFinite(parsedThreshold) ? parsedThreshold : 20;
        rulesUpdated = true;
      } else if (!Number.isFinite(rawThreshold)) {
        updatedRules.critThreshold = 20;
        rulesUpdated = true;
      }

      if (!updatedRules.critDoubleStrategy) {
        updatedRules.critDoubleStrategy = "never";
        rulesUpdated = true;
      }

      if (rulesUpdated) {
        await game.settings.set(MODULE_ID, "rules", updatedRules);
      }
    }

    // 2. Guidance Tiers Migration (v2 equivalent)
    const tiers = game.settings.get(MODULE_ID, "guidanceTiers") as unknown as GuidanceTier[];
    let tiersUpdated = false;
    if (tiers && Array.isArray(tiers)) {
      for (const tier of tiers) {
        if (!tier._migratedToV2 && !tier._migratedGpToCp && tier.costs) {
          for (const key of Object.keys(tier.costs)) {
            tier.costs[key] = Math.round(tier.costs[key] * 100);
          }
          tier._migratedToV2 = true;
          tiersUpdated = true;
        }
      }
    }
    if (tiersUpdated) {
      await game.settings.set(MODULE_ID, "guidanceTiers", tiers);
    }

    // 3. Library and Item Migration (v1 + v4 + v5 equivalent)
    let library =
      (game.settings.get(MODULE_ID, "projectTemplates") as unknown as ProjectTemplateLegacy[]) ||
      [];
    let libraryUpdated = false;
    if (!Array.isArray(library)) {
      library = [];
      libraryUpdated = true;
      await game.settings.set(MODULE_ID, "projectTemplates", library);
    }
    const actors = Array.from(game.actors?.values() || []) as Actor[];

    let allSuccessful = true;
    for (const actor of actors) {
      const projects = (actor.getFlag(MODULE_ID, "projects" as any) || []) as LegacyProject[];
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
            id: FoundryUtils.randomID(),
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
          actor as any,
          tpl.rewardUuid,
          projectData,
          tpl.target,
        );
        if (!created) {
          Logger.warn(
            `Migration: Failed to migrate project ${p.name || p.id} for actor ${actor.name}. Project will be preserved in legacy flags.`,
          );
          remainingProjects.push(p);
          allSuccessful = false;
        }
      }

      // Update legacy projects flag with only those that failed to migrate
      await actor.setFlag(MODULE_ID, "projects" as any, remainingProjects);
    }

    if (libraryUpdated) {
      await game.settings.set(MODULE_ID, "projectTemplates", library);
    }

    if (allSuccessful) {
      await game.settings.set(MODULE_ID, "migrationVersion", "2.0.0");
      ui?.notifications?.info("Downtime Engine direct migration to v2.0.0 successful!");
    } else {
      ui?.notifications?.warn(
        "Downtime Engine | Direct migration partially failed. Some projects were preserved in legacy flags and will be retried later.",
      );
    }
  } catch (error) {
    Logger.error("direct migration failed:", error);
    ui?.notifications?.error(
      "Downtime Engine direct migration failed. Please check the console for details.",
    );
    throw error;
  }
}
