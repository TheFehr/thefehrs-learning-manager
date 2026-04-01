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
    const stashedActivities = itemData.system.activities || {};
    const stashedType = itemData.type || "";
    const stashedName = itemData.name || "";
    const stashedDescription = itemData.system.description?.value || "";
    const stashedSystem = itemData.system || {};
    const stashedSourceUuid = (rewardDoc as { uuid?: string }).uuid || "";

    const projectItem = rewardDoc as unknown as ProjectItem;
    const projectDataFlags = projectItem.getFlag("thefehrs-learning-manager", "projectData");
    const target = projectDataFlags?.target ?? 0;
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
      system: {
        activities: {},
        type: {
          value: LearningFeatType,
        },
        description: {
          value: progressHtml + stashedDescription,
        },
      },
      flags: {
        "thefehrs-learning-manager": {
          projectData: projectData,
          isLearningProject: true,
          isLearnedReward: false,
        },
        "tidy5e-sheet": {
          section: "In-Progress Learning",
        },
      },
    };

    const [created] = await (actor as unknown as Actor5e).createEmbeddedDocuments("Item", [
      updateData as unknown as object,
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
      await ActivityManager.injectActivities(createdItem, projectData.target);
    } catch (err) {
      console.error(
        `Downtime Engine | Failed to inject activities for item "${createdItem.name}". Cleaning up...`,
        err,
      );
      await createdItem.delete();
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
    if (!actor) return;

    const projectDataFlags = projectItem.getFlag("thefehrs-learning-manager", "projectData");
    if (!projectDataFlags) return;
    const stashedSourceUuid = projectDataFlags.stashedSourceUuid;

    let sourceItem: Item5e | null = null;
    if (stashedSourceUuid) {
      try {
        sourceItem = (await fromUuid(stashedSourceUuid)) as unknown as Item5e | null;
      } catch (e) {
        console.warn(`Downtime Engine | Could not find source item ${stashedSourceUuid}`);
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
        },
        stashedEffects: null,
        stashedActivities: null,
        stashedType: null,
        stashedName: null,
        stashedDescription: null,
        stashedSystem: null,
        stashedSourceUuid: null,
      },
      "tidy5e-sheet": {
        section: "Completed Learning",
      },
    };

    if (sourceItem && sourceItem instanceof Item) {
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
        // Delete the old in-progress item
        await (item as unknown as Item).delete();
        ui.notifications?.info(
          `Learning Complete: ${(created as unknown as Item).name} is now fully available!`,
        );
        const created5e = created as unknown as Item5e & {
          displayCard?: (options?: object) => Promise<unknown>;
        };
        if (typeof created5e.displayCard === "function") {
          await created5e.displayCard({ rollMode: Settings.rules.rollMode });
        }
        return;
      }
    }

    // Fallback Restoration: Restore in-place
    console.warn(
      `Downtime Engine | Falling back to in-place restoration for ${
        (item as unknown as Item).name
      }`,
    );

    // Identify learning activities to explicitly remove
    const activityUpdates: Record<string, null> = {};
    const system = item.system as unknown as {
      activities?: {
        forEach: (cb: (activity: { id: string; flags?: Record<string, unknown> }) => void) => void;
      };
    };
    const existingActivities = system.activities;
    if (existingActivities && typeof existingActivities.forEach === "function") {
      existingActivities.forEach((activity) => {
        if (activity.flags?.["thefehrs-learning-manager"]?.isLearningActivity) {
          activityUpdates[`-=${activity.id}`] = null;
        }
      });
    }

    // Restore from stashed system
    const restoredSystem = {
      ...(projectDataFlags.stashedSystem || {}),
      activities: {
        ...(projectDataFlags.stashedActivities || {}),
        ...activityUpdates,
      },
    };

    const dotFlags: Record<string, any> = {};
    for (const [key, value] of Object.entries(completedFlags)) {
      dotFlags[`flags.${key}`] = value;
    }

    const updateData = {
      name: projectDataFlags.stashedName || (item as unknown as Item).name,
      type: projectDataFlags.stashedType || item.type,
      effects: projectDataFlags.stashedEffects || [],
      system: restoredSystem,
      ...dotFlags,
    };

    await (item as unknown as Item).update(updateData);
    ui.notifications?.info(
      `Learning Complete: ${(item as unknown as Item).name} is now fully available!`,
    );
    const item5e = item as unknown as Item5e & {
      displayCard?: (options?: object) => Promise<unknown>;
    };
    if (typeof item5e.displayCard === "function") {
      await item5e.displayCard({ rollMode: Settings.rules.rollMode });
    }
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
      "system.description.value": progressHtml + stashedDescription,
      [`flags.${Settings.ID}.projectData`]: projectData,
    });
  }
}
