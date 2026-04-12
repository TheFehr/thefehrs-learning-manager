import { Settings } from "../core/settings.js";
import { Logger } from "../core/logger.js";
import { ProjectUI } from "../core/project-ui.js";
import { ActivityManager } from "../core/activity-manager.js";
import { LearningFeatType, ProjectFlagData } from "./project-item.js";
import type { Item5e } from "../types.js";
import { DocumentUtils } from "../core/document-utils.js";

export class ProjectLifecycle {
  /**
   * Stashes an item as a learning project.
   * Wipes Active Effects and Activities, then appends the isLearningProject flag.
   */
  static async initiateProjectFromItem(actor: Actor, rewardDoc: Item): Promise<Item5e | null> {
    const itemData = rewardDoc.toObject();
    const stashedEffects = itemData.effects || [];
    const stashedActivities = foundry.utils.deepClone(itemData.system.activities || {});
    const stashedType = itemData.type || "";
    const stashedName = itemData.name || "";
    const stashedDescription = itemData.system.description?.value || "";
    const stashedSystem = foundry.utils.deepClone(itemData.system || {});
    const stashedSourceUuid = rewardDoc.uuid || "";

    const target = rewardDoc.getFlag(Settings.ID, "projectData")?.target ?? 0;

    if (target <= 0) {
      Logger.error(
        `Cannot create project for "${rewardDoc.name}": Invalid target value (${target}). Target must be a positive number.`,
      );
      return null;
    }

    const stashedRequirements = rewardDoc.getFlag(Settings.ID, "projectData")?.requirements ?? [];

    const tutelageName = "Self-Study";

    // Prepare item data for stashing
    const projectData: ProjectFlagData = {
      progress: 0,
      target: target,
      tutelageId: "",
      isLearnedReward: false,
      isLearningProject: true,
      requirements: stashedRequirements,
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
      system: foundry.utils.mergeObject(itemData.system || {}, {
        activities: {},
        type: {
          value: LearningFeatType,
        },
        description: {
          value: progressHtml + stashedDescription,
        },
      }),
      flags: foundry.utils.mergeObject(itemData.flags || {}, {
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

    const [created] = await actor.createEmbeddedDocuments("Item", [updateData] as any[]);
    if (!created) {
      Logger.error(`Failed to create embedded item "${rewardDoc.name}" on actor ${actor.name}`);
      return null;
    }

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
        err,
      );
      try {
        await createdItem.delete();
      } catch (deleteErr) {
        Logger.error(
          `Secondary failure: Failed to delete orphaned item "${createdItem.name}" (ID: ${createdItem.id}) during project creation rollback:`,
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
        Logger.warn(`Could not find source item ${stashedSourceUuid}:`, e);
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

    // Fallback Restoration: Restore in-place (or recreate if type differs)
    Logger.warn(`Falling back to in-place restoration for ${item.name}`);

    const stashedType = projectDataFlags.stashedType || item.type;
    const needsTypeChange = stashedType !== item.type;

    if (needsTypeChange) {
      const success = await this.recreateWithTypeChange(
        item,
        actor,
        stashedType,
        projectDataFlags,
        completedFlags,
      );
      // If type change failed, we should NOT fall back to updateInPlace as it would use the wrong type
      if (!success) {
        Logger.error(
          `Type change recreation failed for ${
            projectDataFlags.stashedName || item.name
          }. Completion aborted.`,
        );
        return;
      }
      return;
    }

    // Standard in-place update if no type change needed
    await this.updateInPlace(item, stashedType, projectDataFlags, completedFlags);
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

      const [created] = await actor.createEmbeddedDocuments("Item", [createData]);

      if (created) {
        await this.handlePostCreationCleanup(
          actor,
          item,
          created as Item,
          Settings.get("rules").rollMode || "gmroll",
        );
        return true;
      }
    } else {
      Logger.warn(
        `sourceItem is not a valid Item. documentName: ${(sourceItem as any)?.documentName}`,
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
        err,
      );
      ui.notifications?.warn(
        `Restored item "${createdItem.name}" but could not delete the original project item. You may have a duplicate.`,
      );
      return false;
    }
    ui.notifications?.info(`Learning Complete: ${createdItem.name} is now fully available!`);
    if (typeof (createdItem as Item5e).displayCard === "function") {
      await (createdItem as Item5e).displayCard({ rollMode });
    }
    return true;
  }

  private static async recreateWithTypeChange(
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
    clonedData.effects = (projectDataFlags.stashedEffects || []) as any[];

    // Replace system data with deep clone of stashed system to prevent artifact survival
    if (projectDataFlags.stashedSystem) {
      clonedData.system = foundry.utils.deepClone(
        projectDataFlags.stashedSystem as unknown as object,
      );
    }

    clonedData.flags = {
      ...(clonedData.flags as object),
      ...completedFlags,
    };

    if (projectDataFlags.stashedActivities) {
      (clonedData.system as any).activities = foundry.utils.deepClone(
        projectDataFlags.stashedActivities as object,
      );
    }

    const [created] = await actor.createEmbeddedDocuments("Item", [clonedData] as any[]);

    if (created) {
      await this.handlePostCreationCleanup(
        actor,
        item,
        created as unknown as Item,
        Settings.get("rules").rollMode || "gmroll",
      );
      return true;
    }
    return false;
  }

  private static async updateInPlace(
    item: Item,
    stashedType: string,
    projectDataFlags: ProjectFlagData,
    completedFlags: any,
  ): Promise<boolean> {
    const dotFlags: Record<string, any> = {};
    for (const [key, value] of Object.entries(completedFlags)) {
      dotFlags[`flags.${key}`] = value;
    }

    // Identify learning activities to explicitly remove via dot-path
    const existingActivities = (item.system as any).activities;
    if (existingActivities) {
      const activityList =
        typeof (existingActivities as { values: () => unknown }).values === "function"
          ? Array.from((existingActivities as { values: () => Iterable<unknown> }).values())
          : Array.isArray(existingActivities)
            ? existingActivities
            : Object.values(existingActivities);

      for (const activity of activityList as Array<{
        id: string;
        flags?: Record<string, any>;
      }>) {
        if (activity?.id && activity.flags?.[Settings.ID]?.isLearningActivity) {
          dotFlags[`system.activities.-=${activity.id}`] = null;
        }
      }
    }

    // Prepare sanitized system without activities
    const { activities: _ignored, ...sanitizedSystem } =
      (projectDataFlags.stashedSystem as unknown as { activities: unknown }) || {};

    // Merge stashed activities (non-learning ones)
    const systemToUpdate: Record<string, unknown> = { ...(sanitizedSystem as any) };
    if (projectDataFlags.stashedActivities) {
      systemToUpdate.activities = {
        ...(systemToUpdate.activities as Record<string, unknown>),
        ...projectDataFlags.stashedActivities,
      };
    }

    const primaryUpdate = {
      name: projectDataFlags.stashedName || item.name,
      effects: projectDataFlags.stashedEffects || [],
      system: systemToUpdate,
      ...dotFlags,
    };

    try {
      // 1. Update basic data, nested system, flags and activity removals atomically
      await item.update(primaryUpdate);
    } catch (err) {
      Logger.error(`Failed to update item in-place:`, err);
      ui.notifications?.error(
        `Failed to complete project in-place for ${item.name}. See console for details.`,
      );
      return false;
    }

    ui.notifications?.info(`Learning Complete: ${item.name} is now fully available!`);
    if (typeof (item as Item5e).displayCard === "function") {
      await (item as Item5e).displayCard({ rollMode: Settings.get("rules").rollMode });
    }
    return true;
  }

  /**
   * Updates an item's name and description based on current progress.
   * Uses stashed values as the base to avoid duplication bugs.
   */
  static async updateItemWithProgress(
    item: Item,
    projectData: ProjectFlagData,
    instructorName: string = "None",
  ) {
    const progressHtml = ProjectUI.generateProgressHtml(
      projectData.progress ?? 0,
      projectData.target ?? 0,
      instructorName,
    );

    const stashedName = projectData.stashedName || item.name;
    const stashedDescription = projectData.stashedDescription || "";

    await DocumentUtils.updateSilently(item, {
      name: `${stashedName} (${projectData.progress}/${projectData.target})`,
      ["system.description.value" as string]: progressHtml + stashedDescription,
      [`flags.${Settings.ID}.projectData`]: projectData,
    } as Record<string, any>);
  }
}
