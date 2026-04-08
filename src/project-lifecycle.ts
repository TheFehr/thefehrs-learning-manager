import { Settings } from "./core/settings.js";
import { ProjectUI } from "./core/project-ui.js";
import { ActivityManager } from "./core/activity-manager.js";
import { LearningFeatType, ProjectFlagData, ProjectItem } from "./project-item.js";
import type { Actor5e, Item5e } from "./types.js";

export class ProjectLifecycle {
  /**
   * Stashes an item as a learning project.
   * Wipes Active Effects and Activities, then appends the isLearningProject flag.
   */
  static async initiateProjectFromItem(
    actor: Actor,
    rewardDoc: Item,
    tutelageId: string = "",
  ): Promise<Item5e | null> {
    const item5e = rewardDoc as unknown as Item5e;
    const itemData = item5e.toObject();
    const stashedEffects = itemData.effects || [];
    const stashedActivities = foundry.utils.deepClone(itemData.system.activities || {});
    const stashedType = itemData.type || "";
    const stashedName = itemData.name || "";
    const stashedDescription = itemData.system.description?.value || "";
    const stashedSystem = foundry.utils.deepClone(itemData.system || {});
    const stashedSourceUuid = (rewardDoc as { uuid?: string }).uuid || "";

    const projectItem = rewardDoc as unknown as ProjectItem;
    const projectDataFlags = projectItem.getFlag("thefehrs-learning-manager", "projectData");
    const target = projectDataFlags?.target ?? 0;

    if (target <= 0) {
      console.error(
        `Downtime Engine | Cannot create project for "${rewardDoc.name}": Invalid target value (${target}). Target must be a positive number.`,
      );
      ui.notifications?.error(
        `Downtime Engine | Failed to create project: Invalid target value for "${rewardDoc.name}".`,
      );
      return null;
    }

    const stashedRequirements = projectDataFlags?.requirements ?? [];

    const tier = Settings.guidanceTiers.find((t) => t.id === tutelageId);
    const tutelageName = tier?.name ?? "None";

    // Prepare item data for stashing
    const projectData: ProjectFlagData = {
      progress: 0,
      target: target,
      tutelageId: tutelageId,
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
        "thefehrs-learning-manager": {
          projectData: projectData,
          isLearningProject: true,
          isLearnedReward: false,
        },
        "tidy5e-sheet": {
          section: "In-Progress Learning",
        },
      }),
    };

    const [created] = await (actor as unknown as Actor5e).createEmbeddedDocuments("Item", [
      updateData as any,
    ]);
    if (!created) {
      console.error(
        `Downtime Engine | Failed to create embedded item "${rewardDoc.name}" on actor ${actor.name}`,
      );
      return null;
    }

    const createdItem = created as unknown as Item5e;
    console.debug(
      `Downtime Engine | Created embedded item "${(created as unknown as Item).name}" (ID: ${createdItem.id}). Injecting activities...`,
    );
    try {
      const injected = await ActivityManager.injectActivities(createdItem, projectData.target);
      if (!injected) {
        throw new Error("No learning activities were injected for the created project item.");
      }
    } catch (err) {
      console.error(
        `Downtime Engine | Failed to inject activities for item "${createdItem.name}". Cleaning up...`,
        err,
      );
      ui.notifications?.error(
        `Downtime Engine | Failed to inject activities for item "${createdItem.name}". Project creation aborted.`,
      );
      try {
        await createdItem.delete();
      } catch (deleteErr) {
        console.error(
          `Downtime Engine | Secondary failure: Failed to delete orphaned item "${createdItem.name}" (ID: ${createdItem.id}) during project creation rollback:`,
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
  static async completeProject(item: Item5e) {
    const isProject = item.getFlag("thefehrs-learning-manager", "isLearningProject");
    if (!isProject) return;
    const projectItem = item as unknown as ProjectItem;
    const actor = item.actor;
    if (!actor) {
      console.warn(
        `Downtime Engine | Cannot complete project "${item.name}" (ID: ${item.id}) - missing parent actor.`,
      );
      return;
    }

    const projectDataFlags = projectItem.getFlag("thefehrs-learning-manager", "projectData");
    if (!projectDataFlags) return;
    const stashedSourceUuid = projectDataFlags.stashedSourceUuid;

    let sourceItem: Item5e | null = null;
    if (stashedSourceUuid) {
      try {
        sourceItem = (await fromUuid(
          stashedSourceUuid as `Item.${string}`,
        )) as unknown as Item5e | null;
      } catch (e) {
        console.warn(`Downtime Engine | Could not find source item ${stashedSourceUuid}:`, e);
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
    console.warn(
      `Downtime Engine | Falling back to in-place restoration for ${
        (item as unknown as Item).name
      }`,
    );

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
        console.error(
          `Downtime Engine | Type change recreation failed for ${
            projectDataFlags.stashedName || (item as unknown as Item).name
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
    item: Item5e,
    actor: Actor,
    sourceItem: Item5e,
    completedFlags: any,
  ): Promise<boolean> {
    const isItem =
      sourceItem && (sourceItem instanceof Item || (sourceItem as any).documentName === "Item");

    if (isItem) {
      // Primary Restoration: Create a new copy from the source item
      const sourceData = sourceItem.toObject();
      const createData = {
        ...sourceData,
        flags: {
          ...(sourceData.flags || {}),
          ...completedFlags,
        },
      };

      const [created] = await (actor as unknown as Actor).createEmbeddedDocuments("Item", [
        createData,
      ]);

      if (created) {
        return this.handlePostCreationCleanup(
          actor,
          item,
          created as unknown as Item,
          Settings.rules.rollMode,
        );
      }
    } else {
      console.warn(
        `Downtime Engine | sourceItem is not a valid Item. documentName: ${
          (sourceItem as any)?.documentName
        }`,
      );
    }
    return false;
  }

  /**
   * Performs post-creation cleanup, notifications, and display logic.
   */
  private static async handlePostCreationCleanup(
    actor: Actor,
    oldItem: Item5e,
    newItem: Item,
    rollMode: string,
  ): Promise<boolean> {
    // Delete the old in-progress item
    const createdItem = newItem as unknown as Item;
    try {
      await (oldItem as unknown as Item).delete();
    } catch (err) {
      console.error(
        `Downtime Engine | Failed to delete original project item after restoration. New item created: ${createdItem.name} (${createdItem.id})`,
        err,
      );
      ui.notifications?.error(
        `Downtime Engine | Failed to remove the in-progress project item. You may have a duplicate item: "${createdItem.name}" (ID: ${createdItem.id}). Please remove the old one manually.`,
      );
      // We return true here because the new item WAS successfully created.
      // Returning false would trigger redundant fallback restoration paths in completeProject,
      // potentially creating even more duplicate items.
      return true;
    }
    ui.notifications?.info(`Learning Complete: ${createdItem.name} is now fully available!`);
    const created5e = createdItem as unknown as Item5e & {
      displayCard?: (options?: object) => Promise<unknown>;
    };
    if (typeof created5e.displayCard === "function") {
      await created5e.displayCard({ rollMode });
    }
    return true;
  }

  private static async recreateWithTypeChange(
    item: Item5e,
    actor: Actor,
    stashedType: string,
    projectDataFlags: ProjectFlagData,
    completedFlags: any,
  ): Promise<boolean> {
    const clonedData = item.toObject() as any;
    clonedData.type = stashedType;
    delete clonedData._id;

    // Update flags and basic info in the clone
    clonedData.name = projectDataFlags.stashedName || (item as unknown as Item).name;
    clonedData.effects = projectDataFlags.stashedEffects || [];

    // Replace system data with deep clone of stashed system to prevent artifact survival
    if (projectDataFlags.stashedSystem) {
      clonedData.system = foundry.utils.deepClone(projectDataFlags.stashedSystem as any);
    }

    clonedData.flags = {
      ...(clonedData.flags || {}),
      ...completedFlags,
    };

    // Restore stashed activities in the clone using deep clone
    if (projectDataFlags.stashedActivities) {
      clonedData.system.activities = foundry.utils.deepClone(
        projectDataFlags.stashedActivities as any,
      );
    }

    const [created] = await (actor as unknown as Actor).createEmbeddedDocuments("Item", [
      clonedData,
    ]);

    if (created) {
      return this.handlePostCreationCleanup(
        actor,
        item,
        created as unknown as Item,
        Settings.rules.rollMode,
      );
    }
    return false;
  }

  private static async updateInPlace(
    item: Item5e,
    stashedType: string,
    projectDataFlags: ProjectFlagData,
    completedFlags: any,
  ): Promise<boolean> {
    const dotFlags: Record<string, any> = {};
    for (const [key, value] of Object.entries(completedFlags)) {
      dotFlags[`flags.${key}`] = value;
    }

    // Identify learning activities to explicitly remove via dot-path
    const existingActivities = item.system.activities as any;
    if (existingActivities) {
      const activityList =
        typeof existingActivities.values === "function"
          ? Array.from(existingActivities.values())
          : Array.isArray(existingActivities)
            ? existingActivities
            : Object.values(existingActivities);

      for (const activity of activityList as any[]) {
        if (activity?.id && activity.flags?.["thefehrs-learning-manager"]?.isLearningActivity) {
          dotFlags[`system.activities.-=${activity.id}`] = null;
        }
      }
    }

    // Prepare sanitized system without activities
    const { activities: _ignored, ...sanitizedSystem } =
      (projectDataFlags.stashedSystem as any) || {};

    // Merge stashed activities (non-learning ones)
    const systemToUpdate: any = { ...sanitizedSystem };
    if (projectDataFlags.stashedActivities) {
      systemToUpdate.activities = {
        ...(systemToUpdate.activities || {}),
        ...projectDataFlags.stashedActivities,
      };
    }

    const primaryUpdate = {
      name: projectDataFlags.stashedName || (item as unknown as Item).name,
      effects: projectDataFlags.stashedEffects || [],
      system: systemToUpdate,
      ...dotFlags,
    };

    try {
      // 1. Update basic data, nested system, flags and activity removals atomically
      await (item as unknown as Item).update(primaryUpdate);
    } catch (err) {
      console.error(`Downtime Engine | Failed to update item in-place:`, err);
      ui.notifications?.error(
        `Downtime Engine | Failed to complete project in-place for ${
          (item as unknown as Item).name
        }. See console for details.`,
      );
      return false;
    }

    ui.notifications?.info(
      `Learning Complete: ${(item as unknown as Item).name} is now fully available!`,
    );
    const item5e = item as unknown as Item5e & {
      displayCard?: (options?: object) => Promise<unknown>;
    };
    if (typeof item5e.displayCard === "function") {
      await item5e.displayCard({ rollMode: Settings.rules.rollMode });
    }
    return true;
  }

  /**
   * Updates an item's name and description based on current progress.
   * Uses stashed values as the base to avoid duplication bugs.
   */
  static async updateItemWithProgress(item: Item5e, projectData: ProjectFlagData) {
    const tier = Settings.guidanceTiers.find((t) => t.id === projectData.tutelageId);
    const tutelageName = tier?.name ?? "None";
    const progressHtml = ProjectUI.generateProgressHtml(
      projectData.progress,
      projectData.target,
      tutelageName,
    );

    const stashedName = projectData.stashedName || (item as unknown as Item).name;
    const stashedDescription = projectData.stashedDescription || "";

    await (item as unknown as Item).update({
      name: `${stashedName} (${projectData.progress}/${projectData.target})`,
      ["system.description.value" as string]: progressHtml + stashedDescription,
      [`flags.${Settings.ID}.projectData`]: projectData,
    });
  }
}
