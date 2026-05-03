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
  static async setFlagsSilently(
    doc: {
      update: (
        data: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => Promise<unknown>;
      name?: string;
      id?: string | null;
    },
    flags: Record<string, unknown>,
  ): Promise<boolean> {
    if (!doc || typeof doc.update !== "function") {
      Logger.error("DocumentUtils.setFlagsSilently | Invalid document provided.", true, doc);
      return false;
    }

    if (!flags || Object.keys(flags).length === 0) {
      return true;
    }

    try {
      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(flags)) {
        updateData[`flags.${MODULE_ID}.${key}`] = value;
      }

      await (
        doc as unknown as {
          update: (data: Record<string, unknown>, options?: object) => Promise<unknown>;
        }
      ).update(updateData, { render: false });
      return true;
    } catch (err) {
      Logger.error(
        `DocumentUtils.setFlagsSilently | Failed to update document ${doc.name || doc.id}:`,
        true,
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
  static async unsetFlagsSilently(
    doc: {
      update: (
        data: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => Promise<unknown>;
      name?: string;
      id?: string | null;
    },
    keys: string[],
  ): Promise<boolean> {
    if (!doc || typeof doc.update !== "function") {
      Logger.error("DocumentUtils.unsetFlagsSilently | Invalid document provided.", true, doc);
      return false;
    }

    if (!keys || keys.length === 0) {
      return true;
    }

    try {
      const updateData: Record<string, unknown> = {};
      for (const key of keys) {
        updateData[`flags.${MODULE_ID}.-=${key}`] = null;
      }

      await (
        doc as unknown as {
          update: (data: Record<string, unknown>, options?: object) => Promise<unknown>;
        }
      ).update(updateData, { render: false });
      return true;
    } catch (err) {
      Logger.error(
        `DocumentUtils.unsetFlagsSilently | Failed to update document ${doc.name || doc.id}:`,
        true,
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
  static async updateSilently(
    doc: {
      update: (
        data: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => Promise<unknown>;
      name?: string;
      id?: string | null;
    },
    data: Record<string, unknown>,
  ): Promise<boolean> {
    if (!doc || typeof doc.update !== "function") {
      Logger.error("DocumentUtils.updateSilently | Invalid document provided.", true, doc);
      return false;
    }

    if (Object.keys(data || {}).length === 0) return true;

    try {
      await (
        doc as unknown as {
          update: (data: Record<string, unknown>, options?: object) => Promise<unknown>;
        }
      ).update(data, { render: false });
      return true;
    } catch (err) {
      Logger.error(
        `DocumentUtils.updateSilently | Failed to update document ${doc.name || doc.id}:`,
        true,
        err,
      );
      return false;
    }
  }

  /**
   * Safe wrapper for createEmbeddedDocuments to handle potential exceptions.
   *
   * @param actor The parent actor.
   * @param type The document type (e.g., "Item").
   * @param docs The document data to create.
   * @param rewardName The name of the reward for logging context.
   * @returns A promise that resolves to the created documents, or an empty array if failed.
   */
  static async safeCreateEmbeddedDocuments<T = unknown>(
    actor: Actor,
    type: string,
    docs: any[],
    rewardName: string,
  ): Promise<T[]> {
    if (!actor || typeof actor.createEmbeddedDocuments !== "function") {
      Logger.error(
        "DocumentUtils.safeCreateEmbeddedDocuments | Invalid actor provided.",
        true,
        actor,
      );
      return [];
    }

    if (!docs || docs.length === 0) {
      return [];
    }

    try {
      const results = (await actor.createEmbeddedDocuments(type as "Item", docs)) as unknown as T[];
      if (!results || results.length === 0) {
        Logger.error(
          `DocumentUtils.safeCreateEmbeddedDocuments | Failed to create embedded documents for "${rewardName}" on actor "${actor.name || actor.id}" (no documents returned).`,
        );
        return [];
      }
      return results;
    } catch (err) {
      Logger.error(
        `DocumentUtils.safeCreateEmbeddedDocuments | Exception occurred during createEmbeddedDocuments for "${rewardName}" on actor "${actor.name || actor.id}":`,
        true,
        err,
      );
      return [];
    }
  }
}
