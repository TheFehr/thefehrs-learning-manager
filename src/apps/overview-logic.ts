import { MODULE_ID } from "@/global.js";
import { Settings } from "@/core/settings.js";
import { Logger } from "@/core/logger.js";
import type { Item5e } from "@/types.js";
import type { ProjectFlagData } from "@/logic/project-item.js";
import { getGame } from "@/core/foundry.js";

export interface InvalidProjectReason {
  item: { name: string; sheet?: { render: (force: boolean) => void } | null };
  packName: string;
  reasons: string[];
}

interface ValidationData {
  name?: string;
  flags?: {
    [MODULE_ID]?: {
      projectData?: ProjectFlagData;
    };
  };
  system?: {
    description?: {
      value?: string;
    };
    activities?: any[] | Record<string, any> | { size: number };
  };
  effects?: any[] | { size: number };
}

function validateProjectData(data: ValidationData): string[] {
  const reasons: string[] = [];
  const projectData = data.flags?.[MODULE_ID]?.projectData;

  // Criteria 1: Missing or invalid target
  if (
    projectData?.target === undefined ||
    projectData?.target === null ||
    projectData?.target <= 0
  ) {
    reasons.push("Missing or invalid project target (must be > 0).");
  }

  // Criteria 2: Missing activities or effects
  const activities = data.system?.activities || {};
  const effects = data.effects || [];
  let hasActivities = false;
  if (Array.isArray(activities)) {
    hasActivities = activities.length > 0;
  } else if (typeof activities === "object" && "size" in activities) {
    hasActivities = (activities as any).size > 0;
  } else {
    hasActivities = Object.keys(activities).length > 0;
  }

  let hasEffects = false;
  if (Array.isArray(effects)) {
    hasEffects = effects.length > 0;
  } else if (typeof effects === "object" && "size" in effects) {
    hasEffects = effects.size > 0;
  }

  if (!hasActivities && !hasEffects) {
    reasons.push("Project has neither activities nor effects.");
  }

  // Criteria 3: Missing name or description
  if (!data.name || data.name.trim().length === 0) {
    reasons.push("Project name is missing or empty.");
  }

  const description = data.system?.description?.value;
  if (!description || description.trim().length === 0) {
    reasons.push("Project description is missing or empty.");
  }

  return reasons;
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
    const pack = getGame().packs?.get(packId);
    if (!pack) {
      Logger.warn(`Configured compendium "${packId}" not found.`);
      continue;
    }

    // Only scan items
    if (pack.metadata.type !== "Item") {
      continue;
    }

    // Foundry's getIndex typing doesn't support custom fields, but the API does.
    // We use double type assertions to bypass the strict compiler checks.
    let index: (ValidationData & { _id: string })[] = [];
    try {
      index = (await pack.getIndex({
        fields: [
          `flags.${MODULE_ID}.projectData`,
          "system.description.value",
          "system.activities",
          "effects",
        ] as any,
        force: true,
      } as any)) as unknown as (ValidationData & { _id: string })[];
    } catch (error) {
      Logger.error(
        `Failed to read index for compendium "${packId}": ${
          error instanceof Error ? error.message : error
        }`,
      );
      continue;
    }

    const tasks = index
      .map((indexEntry) => ({ indexEntry, initialReasons: validateProjectData(indexEntry) }))
      .filter((task) => task.initialReasons.length > 0);

    const results = await Promise.allSettled(
      tasks.map((task) => pack.getDocument(task.indexEntry._id)),
    );

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const result = results[i];
      if (result.status === "fulfilled") {
        const item = result.value as Item5e;
        // Re-validate against the full item data to ensure the index wasn't stale
        const finalReasons = validateProjectData(item as unknown as ValidationData);

        if (finalReasons.length > 0) {
          invalidProjects.push({
            item,
            packName: pack.metadata.label,
            reasons: finalReasons,
          });
        }
      } else {
        Logger.warn(
          `Failed to load document "${task.indexEntry._id}" from "${packId}":`,
          result.reason,
        );
        // Use index data as fallback for display
        invalidProjects.push({
          item: { name: task.indexEntry.name || "Unknown Item" },
          packName: pack.metadata.label,
          reasons: [...task.initialReasons, "Failed to load full item data."],
        });
      }
    }
  }

  return invalidProjects;
}
