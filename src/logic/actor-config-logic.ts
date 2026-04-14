import { DocumentUtils } from "@/core/document-utils.js";
import type { Actor5e, TeacherOffering } from "@/types.js";
import { extractItemUuidFromDrop, searchWithOmnisearchOrQuickInsert } from "./config-utils.js";

/**
 * Logic for the Actor Tutelage Config component.
 */
export class ActorConfigLogic {
  /**
   * Saves the teacher configuration to the actor's flags.
   */
  static async saveConfig(actor: Actor5e, offerings: TeacherOffering[], enabled: boolean) {
    return await DocumentUtils.setFlagsSilently(actor, {
      teacherOfferings: offerings,
      learningModeEnabled: enabled,
    });
  }

  /**
   * Orchestrates the search for a project using available modules.
   */
  static async searchProject(): Promise<string | null> {
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
