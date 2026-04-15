import { MODULE_ID } from "@/global.js";
import { DocumentUtils } from "@/core/document-utils.js";
import type { Item5e, ProjectRequirement } from "@/types.js";
import { extractItemUuidFromDrop, searchWithOmnisearchOrQuickInsert } from "./config-utils.js";

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
      followUpProjectId: string;
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
        updateData[`flags.${MODULE_ID}.projectData`] = project;
      } else {
        updateData[`flags.${MODULE_ID}.-=projectData`] = null;
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

  /**
   * Orchestrates the search for a follow-up project using available modules.
   */
  static async searchFollowUp(): Promise<string | null> {
    return await searchWithOmnisearchOrQuickInsert("!item ", ["Item"]);
  }

  /**
   * Processes a drop event to extract an Item UUID.
   */
  static handleDrop(e: DragEvent): string | null {
    e.preventDefault();
    e.stopPropagation();
    return extractItemUuidFromDrop(e);
  }
}
