import { MODULE_ID } from "@/global.js";
import { DocumentUtils } from "@/core/document-utils.js";
import type { Item5e, ProjectRequirement } from "@/types.js";

/**
 * Logic for the Item Target Config component.
 */
export class ItemConfigLogic {
  /**
   * Saves the project configuration to the item's flags.
   */
  static async saveConfig(
    item: Item5e,
    enabled: boolean,
    project?: {
      target: number;
      requirements: ProjectRequirement[];
      categories: string[];
    },
    book?: {
      modifier: number;
      categories: string[];
    },
  ) {
    const updateData: Record<string, unknown> = {
      [`flags.${MODULE_ID}.learningModeEnabled`]: enabled,
    };

    if (enabled) {
      if (project) {
        // IMPORTANT: Preserve existing hierarchical links
        const existing = item.getFlag(MODULE_ID, "projectData") as
          | { followUpProjectId?: string }
          | undefined;
        updateData[`flags.${MODULE_ID}.projectData`] = {
          ...project,
          followUpProjectId: existing?.followUpProjectId ?? "",
        };
      } else {
        const existing = item.getFlag(MODULE_ID, "projectData") as
          | { followUpProjectId?: string }
          | undefined;
        if (existing?.followUpProjectId) {
          updateData[`flags.${MODULE_ID}.projectData.followUpProjectId`] =
            existing.followUpProjectId;
        }
      }

      if (book) {
        updateData[`flags.${MODULE_ID}.learningBookBonus`] = book;
      } else {
        updateData[`flags.${MODULE_ID}.-=learningBookBonus`] = null;
      }
    } else {
      updateData[`flags.${MODULE_ID}.-=projectData`] = null;
      updateData[`flags.${MODULE_ID}.-=learningBookBonus`] = null;
    }

    return await DocumentUtils.updateSilently(item, updateData);
  }
}
