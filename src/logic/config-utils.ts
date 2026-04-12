import { Logger } from "../core/logger.js";
import { getModuleAPI } from "../types.js";

/**
 * Orchestrates the search for an item using available modules.
 */
export async function searchWithOmnisearchOrQuickInsert(
  query = "!item ",
  restrictTypes = ["Item"],
): Promise<string | null> {
  const omnisearch = CONFIG.SpotlightOmnisearch;
  if (omnisearch?.prompt) {
    const result = await omnisearch.prompt({ query });
    return result?.data?.uuid || null;
  }

  const quickInsert = getModuleAPI("quick-insert");
  if (quickInsert?.open) {
    return new Promise((resolve) => {
      quickInsert.open({
        mode: 1, // Insert mode
        restrictTypes,
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
export function extractItemUuidFromDrop(e: DragEvent): string | null {
  try {
    const dataStr = e.dataTransfer?.getData("text/plain");
    if (!dataStr) return null;
    const data = JSON.parse(dataStr);
    if (data && data.uuid && (data.type === "Item" || data.uuid.startsWith("Item."))) {
      return data.uuid;
    }
  } catch (err) {
    Logger.error("Failed to parse drop data:", err);
  }
  return null;
}
