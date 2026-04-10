import { DocumentUtils } from "../core/document-utils.js";
import { Logger } from "../core/logger.js";
import { getModuleAPI, type Item5e, type ProjectRequirement } from "../types.js";

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
    bookProjectUuids: string[],
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
        projectUuids: bookProjectUuids,
        categories: bookCategories,
      },
    });
  }

  /**
   * Orchestrates the search for a follow-up project using available modules.
   */
  static async searchFollowUp(): Promise<string | null> {
    const omnisearch = CONFIG.SpotlightOmnisearch;
    if (omnisearch?.prompt) {
      const result = await omnisearch.prompt({ query: "!item " });
      return result?.data?.uuid || null;
    }

    const quickInsert = getModuleAPI("quick-insert");
    if (quickInsert?.open) {
      return new Promise((resolve) => {
        quickInsert.open({
          mode: 1, // Insert mode
          restrictTypes: ["Item"],
          onSubmit: (item: { uuid: string }) => resolve(item.uuid),
          onClose: () => resolve(null),
        });
      });
    }

    Logger.info(
      "Spotlight Omnisearch or Quick Insert not found. You can drag and drop an item into the input field.",
      true,
    );
    return null;
  }

  /**
   * Processes a drop event to extract an Item UUID.
   */
  static handleDrop(e: DragEvent): string | null {
    e.preventDefault();
    e.stopPropagation();
    try {
      const dataStr = e.dataTransfer?.getData("text/plain");
      if (!dataStr) return null;
      const data = JSON.parse(dataStr);
      if (data && data.uuid && data.type === "Item") {
        return data.uuid;
      }
    } catch (err) {
      Logger.error("Failed to parse drop data:", err);
    }
    return null;
  }
}
