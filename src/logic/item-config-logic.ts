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
    const flags: Record<string, unknown> = {};

    if (project) {
      flags.projectData = project;
    } else {
      flags["-=projectData"] = null;
    }

    if (book) {
      flags.learningBookBonus = book;
    } else {
      flags["-=learningBookBonus"] = null;
    }

    return await DocumentUtils.setFlagsSilently(item, flags);
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
