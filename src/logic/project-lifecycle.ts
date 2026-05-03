import { Settings } from "@/core/settings.js";
import { Logger } from "@/core/logger.js";
import { FoundryUtils } from "@/core/foundry-utils.js";
import { ProjectUI } from "@/core/project-ui.js";
import { ActivityManager } from "@/core/activity-manager.js";
import { LearningFeatType, ProjectFlagData } from "./project-item.js";
import type { Item5e } from "@/types.js";
import { DocumentUtils } from "@/core/document-utils.js";
import { getUI } from "@/core/foundry.js";

export class ProjectLifecycle {
  /**
   * Stashes an item as a learning project.
   * Wipes Active Effects and Activities, then appends the isLearningProject flag.
   */
  static async initiateProjectFromItem(actor: Actor, rewardDoc: Item): Promise<Item5e | null> {
    const itemData = rewardDoc.toObject();
    const stashedEffects = itemData.effects || [];
    const stashedActivities = FoundryUtils.deepClone(itemData.system.activities || {});
    const stashedType = itemData.type || "";
    const stashedName = itemData.name || "";
    const stashedDescription = itemData.system.description?.value || "";
    const stashedSystem = FoundryUtils.deepClone(itemData.system || {});
    const stashedSourceUuid = rewardDoc.uuid || "";

    const target = rewardDoc.getFlag(Settings.ID, "projectData")?.target ?? 0;

    if (target <= 0) {
      Logger.error(
        `Cannot create project for "${rewardDoc.name}": Invalid target value (${target}). Target must be a positive number.`,
      );
      return null;
    }

    const stashedRequirements = rewardDoc.getFlag(Settings.ID, "projectData")?.requirements ?? [];
    const stashedCategories = rewardDoc.getFlag(Settings.ID, "projectData")?.categories ?? [];
    const stashedFollowUp = rewardDoc.getFlag(Settings.ID, "projectData")?.followUpProjectId ?? "";

    const tutelageName = "Self-Study";

    // Prepare item data for stashing
    const projectData: ProjectFlagData = {
      progress: 0,
      target: target,
      tutelageId: "",
      isLearnedReward: false,
      isLearningProject: true,
      requirements: stashedRequirements,
      categories: stashedCategories,
      followUpProjectId: stashedFollowUp,
      stashedEffects,
      stashedActivities,
      stashedType,
      stashedName,
      stashedDescription,
      stashedSystem,
      stashedSourceUuid,
    };

    const progressHtml = ProjectUI.generateProgressHtml(0, target, tutelageName);

    const updateData = {
      ...itemData,
      name: `${stashedName} (0/${target})`,
      type: "feat",
      effects: [],
      system: FoundryUtils.mergeObject(itemData.system || {}, {
        activities: {},
        type: {
          value: LearningFeatType,
        },
        description: {
          value: progressHtml + stashedDescription,
        },
      }),
      flags: FoundryUtils.mergeObject(itemData.flags || {}, {
        [Settings.ID]: {
          projectData: projectData,
          isLearningProject: true,
          isLearnedReward: false,
        },
        "tidy5e-sheet": {
          section: "In-Progress Learning",
        },
      }),
    };

    const items = await DocumentUtils.safeCreateEmbeddedDocuments<Item5e>(
      actor,
      "Item",
      [updateData] as unknown as Record<string, unknown>[],
      rewardDoc.name ?? "Unknown Reward",
    );
    if (!items || items.length === 0) {
      return null;
    }

    const created = items[0];

    const createdItem = created as Item5e;
    Logger.debug(
      `Created embedded item "${(created as unknown as Item).name}" (ID: ${createdItem.id}). Injecting activities...`,
    );
    try {
      const injected = await ActivityManager.injectActivities(createdItem, projectData.target);
      if (!injected) {
        throw new Error("No learning activities were injected for the created project item.");
      }
    } catch (err) {
      Logger.error(
        `Failed to inject activities for item "${createdItem.name}". Project creation aborted.`,
        true,
        err,
      );
      try {
        await createdItem.delete();
      } catch (deleteErr) {
        Logger.error(
          `Secondary failure: Failed to delete orphaned item "${createdItem.name}" (ID: ${createdItem.id}) during project creation rollback:`,
          true,
          deleteErr,
        );
      }
      return null;
    }
    return createdItem;
  }

  /**
   * Restores a project item to its original state upon completion.
   */
  static async completeProject(item: Item) {
    const isProject = item.getFlag(Settings.ID, "isLearningProject");
    if (!isProject) return;
    const actor = item.actor;
    if (!actor) {
      Logger.warn(
        `Cannot complete project "${item.name}" (ID: ${item.id}) - missing parent actor.`,
      );
      return;
    }

    const projectDataFlags = item.getFlag(Settings.ID, "projectData");
    if (!projectDataFlags) return;
    const stashedSourceUuid = projectDataFlags.stashedSourceUuid;

    let sourceItem: Item | null = null;
    if (stashedSourceUuid) {
      try {
        const doc = await fromUuid(stashedSourceUuid as `Item.${string}`);
        sourceItem = doc instanceof Item ? (doc as Item) : null;
      } catch (e) {
        Logger.warn(`Could not find source item ${stashedSourceUuid}:`, true, e);
      }
    }

    const completedFlags = {
      [Settings.ID]: {
        isLearningProject: false,
        isLearnedReward: true,
        projectData: {
          ...projectDataFlags,
          isCompleted: true,
          progress: projectDataFlags.target,
          stashedEffects: null,
          stashedActivities: null,
          stashedType: null,
          stashedName: null,
          stashedDescription: null,
          stashedSystem: null,
          stashedSourceUuid: null,
        },
      },
      "tidy5e-sheet": {
        section: "Completed Learning",
      },
    };

    if (sourceItem != null) {
      const success = await this.restoreFromSource(item, actor, sourceItem, completedFlags);
      if (success) return;
    }

    // Fallback Restoration: Always recreate to ensure clean data migration
    // especially for dnd5e v3 activities which can fail on in-place updates with deletions
    Logger.warn(`Falling back to recreation restoration for ${item.name}`);

    const stashedType = projectDataFlags.stashedType || item.type;
    const success = await this.recreateItem(
      item,
      actor,
      stashedType,
      projectDataFlags,
      completedFlags,
    );

    if (!success) {
      Logger.error(
        `Restoration failed for ${projectDataFlags.stashedName || item.name}. Completion aborted.`,
      );
    }
  }

  private static async restoreFromSource(
    item: Item,
    actor: Actor,
    sourceItem: Item,
    completedFlags: any,
  ): Promise<boolean> {
    const isItem = sourceItem instanceof Item;

    if (isItem) {
      // Primary Restoration: Create a new copy from the source item
      const sourceData = sourceItem.toObject();
      const createData = {
        ...sourceData,
        flags: {
          ...sourceData.flags,
          ...completedFlags,
        },
      };

      const createdDocs = await DocumentUtils.safeCreateEmbeddedDocuments<Item>(
        actor,
        "Item",
        [createData],
        sourceItem.name ?? "Unknown Item",
      );
      const created = createdDocs?.[0];

      if (created) {
        return await this.handlePostCreationCleanup(
          actor,
          item,
          created as Item,
          Settings.get("rules").rollMode || "gmroll",
        );
      }
    } else {
      Logger.warn(
        `sourceItem is not a valid Item. documentName: ${(sourceItem as unknown as { documentName: string }).documentName}`,
      );
    }
    return false;
  }

  /**
   * Performs post-creation cleanup, notifications, and display logic.
   */
  private static async handlePostCreationCleanup(
    actor: Actor,
    oldItem: Item,
    newItem: Item,
    rollMode: string,
  ): Promise<boolean> {
    // Delete the old in-progress item
    const createdItem = newItem;
    try {
      await oldItem.delete();
    } catch (err) {
      Logger.error(
        `Failed to delete original project item after restoration. New item created: ${createdItem.name} (${createdItem.id})`,
        true,
        err,
      );
      getUI()?.notifications?.warn(
        `Restored item "${createdItem.name}" but could not delete the original project item. You may have a duplicate.`,
      );
      return true;
    }
    getUI()?.notifications?.info(`Learning Complete: ${createdItem.name} is now fully available!`);
    if (typeof (createdItem as Item5e).displayCard === "function") {
      await (createdItem as Item5e).displayCard({ rollMode });
    }
    return true;
  }

  private static async recreateItem(
    item: Item,
    actor: Actor,
    stashedType: string,
    projectDataFlags: ProjectFlagData,
    completedFlags: any,
  ): Promise<boolean> {
    const clonedData = item.toObject() as unknown as Record<string, unknown>;
    clonedData.type = stashedType;
    delete clonedData._id;

    // Update flags and basic info in the clone
    clonedData.name = projectDataFlags.stashedName || item.name;
    clonedData.effects = (projectDataFlags.stashedEffects || []) as unknown[];

    // Restore system data via merge to prevent artifact survival while preserving required structures
    if (projectDataFlags.stashedSystem) {
      clonedData.system = FoundryUtils.deepClone(
        projectDataFlags.stashedSystem as unknown as object,
      );
    }

    clonedData.flags = {
      ...(clonedData.flags as object),
      ...completedFlags,
    };

    // Ensure activities are restored to their stashed state (or empty)
    if (clonedData.system) {
      (clonedData.system as Record<string, unknown>).activities = FoundryUtils.deepClone(
        projectDataFlags.stashedActivities || {},
      );
    }

    const createdDocs = await DocumentUtils.safeCreateEmbeddedDocuments<Item>(
      actor,
      "Item",
      [clonedData] as unknown as Record<string, unknown>[],
      item.name ?? "Unknown Item",
    );
    const created = createdDocs?.[0];

    if (created) {
      return await this.handlePostCreationCleanup(
        actor,
        item,
        created as unknown as Item,
        Settings.get("rules").rollMode || "gmroll",
      );
    }
    return false;
  }

  /**
   * Updates an item's name and description based on current progress.
   * Uses stashed values as the base to avoid duplication bugs.
   */
  static async updateItemWithProgress(
    item: Item,
    projectData: ProjectFlagData,
    instructorName: string = "Self-Study",
    render: boolean = false,
  ): Promise<void> {
    const progress = projectData.progress ?? 0;
    const target = projectData.target ?? 0;

    const progressHtml = ProjectUI.generateProgressHtml(progress, target, instructorName);

    const stashedName = projectData.stashedName || item.name;
    const stashedDescription = projectData.stashedDescription || "";

    const updateData = {
      name: `${stashedName} (${progress}/${target})`,
      ["system.description.value"]: progressHtml + stashedDescription,
      [`flags.${Settings.ID}.projectData`]: projectData,
    } as Record<string, unknown>;

    const success = render
      ? await (item.update(updateData) as Promise<unknown>)
      : await DocumentUtils.updateSilently(item, updateData);

    if (success === false) {
      const errorMsg = `Failed to update item "${item.name}" (${item.id}) with new progress.`;
      Logger.error(errorMsg, false);
      throw new Error(errorMsg);
    }
  }
}
