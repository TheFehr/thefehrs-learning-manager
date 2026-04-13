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
    target: number,
    followUpProjectId: string,
    requirements: ProjectRequirement[],
    categories: string[],
    bookModifier: number,
    bookCategories: string[],
  ) {
    return await DocumentUtils.setFlagsSilently(item, {
      projectData: {
        target,
        followUpProjectId,
        requirements,
        categories,
      },
      learningBookBonus: {
        modifier: bookModifier,
        categories: bookCategories,
      },
    });
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
