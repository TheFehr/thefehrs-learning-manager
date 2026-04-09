import { MODULE_ID } from "../global.js";
import { Settings } from "../core/settings.js";
import type { Item5e } from "../types.js";
import type { ProjectFlagData } from "../logic/project-item.js";

export interface InvalidProjectReason {
  item: Item5e;
  packName: string;
  reasons: string[];
}

/**
 * Scans all configured compendiums for learning projects that are missing required flags,
 * targets, or basic metadata like name and description.
 *
 * @returns {Promise<InvalidProjectReason[]>} A list of projects found to be invalid and their reasons.
 */
export async function getInvalidProjects(): Promise<InvalidProjectReason[]> {
  const allowedCompendiums = Settings.get("allowedCompendiums");
  const invalidProjects: InvalidProjectReason[] = [];

  for (const packId of allowedCompendiums) {
    const pack = game.packs.get(packId);
    if (!pack) {
      console.warn(`Downtime Engine | Configured compendium "${packId}" not found.`);
      continue;
    }

    // Only scan items
    if (pack.metadata.type !== "Item") {
      continue;
    }

    const documents = (await pack.getDocuments()) as Item5e[];

    for (const item of documents) {
      const projectData = item.getFlag(MODULE_ID, "projectData") as ProjectFlagData | undefined;
      const reasons: string[] = [];

      // Criteria 1: Missing isLearningProject flag in projectData
      if (!projectData?.isLearningProject) {
        reasons.push("Missing or invalid isLearningProject flag in projectData.");
      }

      // Criteria 2: Missing or invalid target
      if (
        projectData?.target === undefined ||
        projectData?.target === null ||
        projectData?.target <= 0
      ) {
        reasons.push("Missing or invalid project target (must be > 0).");
      }

      // Criteria 3: Missing name or description
      if (!item.name || item.name.trim().length === 0) {
        reasons.push("Project name is missing or empty.");
      }

      if (!item.system?.description?.value || item.system.description.value.trim().length === 0) {
        reasons.push("Project description is missing or empty.");
      }

      if (reasons.length > 0) {
        invalidProjects.push({
          item,
          packName: pack.metadata.label,
          reasons,
        });
      }
    }
  }

  return invalidProjects;
}
