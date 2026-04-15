import { MODULE_ID } from "@/global.js";
import { Logger } from "./logger.js";

/**
 * Utility class for common document operations in Foundry VTT.
 */
export class DocumentUtils {
  /**
   * Sets module-specific flags on a document without triggering a UI re-render.
   * This is useful for background auto-saves and state synchronization.
   *
   * @param doc The document to update (Actor, Item, etc.).
   * @param flags A record of flag keys and values to set.
   * @returns A promise that resolves to `true` if the update succeeded, otherwise `false`.
   */
  static async setFlagsSilently(doc: any, flags: Record<string, unknown>): Promise<boolean> {
    if (!doc || typeof doc.update !== "function") {
      Logger.error("DocumentUtils.setFlagsSilently | Invalid document provided.", doc);
      return false;
    }

    try {
      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(flags)) {
        updateData[`flags.${MODULE_ID}.${key}`] = value;
      }

      await doc.update(updateData, { render: false });
      return true;
    } catch (err) {
      Logger.error(
        `DocumentUtils.setFlagsSilently | Failed to update document ${doc.name || doc.id}:`,
        err,
      );
      return false;
    }
  }

  /**
   * Removes module-specific flags from a document without triggering a UI re-render.
   *
   * @param doc The document to update.
   * @param keys The flag keys to remove.
   * @returns A promise that resolves to `true` if the update succeeded, otherwise `false`.
   */
  static async unsetFlagsSilently(doc: any, keys: string[]): Promise<boolean> {
    if (!doc || typeof doc.update !== "function") {
      Logger.error("DocumentUtils.unsetFlagsSilently | Invalid document provided.", doc);
      return false;
    }

    try {
      const updateData: Record<string, unknown> = {};
      for (const key of keys) {
        updateData[`flags.${MODULE_ID}.-=${key}`] = null;
      }

      await doc.update(updateData, { render: false });
      return true;
    } catch (err) {
      Logger.error(
        `DocumentUtils.unsetFlagsSilently | Failed to update document ${doc.name || doc.id}:`,
        err,
      );
      return false;
    }
  }

  /**
   * Updates a document's data without triggering a UI re-render.
   *
   * @param doc The document to update.
   * @param data The data to update.
   * @returns A promise that resolves to `true` if the update succeeded, otherwise `false`.
   */
  static async updateSilently(doc: any, data: Record<string, unknown>): Promise<boolean> {
    if (!doc || typeof doc.update !== "function") {
      Logger.error("DocumentUtils.updateSilently | Invalid document provided.", doc);
      return false;
    }

    try {
      await doc.update(data, { render: false });
      return true;
    } catch (err) {
      Logger.error(
        `DocumentUtils.updateSilently | Failed to update document ${doc.name || doc.id}:`,
        err,
      );
      return false;
    }
  }
}
