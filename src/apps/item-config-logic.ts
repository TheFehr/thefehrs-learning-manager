import type { Item5e, ProjectRequirement } from "../types.js";

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
  ) {
    try {
      await item.setFlag("thefehrs-learning-manager", "projectData", {
        target,
        followUpProjectId,
        requirements,
      } as any);
      return true;
    } catch (err) {
      console.error("Downtime Engine | Failed to save item configuration:", err);
      const msg = err instanceof Error ? err.message : String(err);
      ui.notifications?.error("Downtime Engine | Failed to save configuration: " + msg);
      throw err;
    }
  }

  /**
   * Orchestrates the search for a follow-up project using available modules.
   */
  static async searchFollowUp(): Promise<string | null> {
    const omnisearch = (CONFIG as any).SpotlightOmnisearch;
    if (omnisearch?.prompt) {
      const result = await omnisearch.prompt({ query: "!item " });
      return result?.data?.uuid || null;
    }

    const quickInsert = (game as any).modules.get("quick-insert")?.api;
    if (quickInsert?.searchItem) {
      const result = await quickInsert.searchItem({ classes: ["Item"] });
      return result?.uuid || null;
    }

    ui.notifications?.info(
      "Spotlight Omnisearch or Quick Insert not found. You can drag and drop an item into the input field.",
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
      console.error("Downtime Engine | Failed to parse drop data:", err);
    }
    return null;
  }
}
