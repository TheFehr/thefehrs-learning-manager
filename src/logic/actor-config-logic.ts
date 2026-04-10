import { DocumentUtils } from "../core/document-utils.js";
import { Logger } from "../core/logger.js";
import type { Actor5e, TeacherOffering } from "../types.js";
import { getModuleAPI } from "../types.js";

/**
 * Logic for the Actor Tutelage Config component.
 */
export class ActorConfigLogic {
  /**
   * Saves the teacher configuration to the actor's flags.
   */
  static async saveConfig(actor: Actor5e, offerings: TeacherOffering[]) {
    return await DocumentUtils.setFlagsSilently(actor, {
      teacherOfferings: offerings,
    });
  }

  /**
   * Orchestrates the search for a project using available modules.
   */
  static async searchProject(): Promise<string | null> {
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
