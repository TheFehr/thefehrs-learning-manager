import { Logger } from "@/core/logger.js";
import { getModuleAPI } from "@/types.js";

/**
 * Orchestrates the search for an item using available modules.
 */
export async function searchWithOmnisearchOrQuickInsert(
  query = "!item ",
  restrictTypes = ["Item"],
): Promise<string | null> {
  try {
    const omnisearch = CONFIG.SpotlightOmnisearch;
    if (omnisearch?.prompt) {
      const result = await omnisearch.prompt({ query });
      const uuid = result?.data?.uuid;
      if (uuid) {
        const doc = await fromUuid(uuid as any);
        if (doc && (restrictTypes.length === 0 || restrictTypes.includes(doc.documentName))) {
          return uuid;
        }
      }
    }
  } catch (err) {
    Logger.error("Spotlight Omnisearch prompt failed:", true, err);
  }

  try {
    const quickInsert = getModuleAPI("quick-insert");
    if (quickInsert?.open) {
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          Logger.warn("Quick Insert dialog timed out.");
          resolve(null);
        }, 30000); // 30 second timeout

        quickInsert.open({
          mode: 1, // Insert mode
          restrictTypes,
          onSubmit: async (item: { uuid: string }) => {
            clearTimeout(timeoutId);
            const doc = await fromUuid(item.uuid as any);
            if (!doc || (restrictTypes.length > 0 && !restrictTypes.includes(doc.documentName))) {
              resolve(null);
            } else {
              resolve(item.uuid);
            }
          },
          onClose: () => {
            clearTimeout(timeoutId);
            resolve(null);
          },
        });
      });
    }
  } catch (err) {
    Logger.error("Quick Insert failed:", true, err);
    return null;
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
    Logger.error("Failed to parse drop data:", true, err);
  }
  return null;
}
