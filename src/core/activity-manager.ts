import { Settings } from "./settings.js";
import { Logger } from "./logger.js";
import { FoundryUtils } from "./foundry-utils.js";
import { createBaseActivityTemplate } from "./constants.js";
import type { Actor5e, Item5e, ActivityData5e } from "@/types.js";
import { getGame, getUI } from "./foundry.js";

export class ActivityManager {
  /**
   * Generates training activities data based on world settings.
   */
  static getActivitiesData(target: number): ActivityData5e[] {
    if (target <= 0) return [];

    const timeUnits = Settings.get("timeUnits");
    if (!Array.isArray(timeUnits) || timeUnits.length === 0) {
      return [];
    }

    const activities: ActivityData5e[] = timeUnits.map((tu) => {
      const activity: any = {
        ...createBaseActivityTemplate(),
        _id: FoundryUtils.randomID(),
        type: "utility",
        img: "icons/svg/book.svg",
        sort: 0,
        description: {
          chatFlavor: `Training for ${tu.name}`,
        },
        flags: {
          "thefehrs-learning-manager": {
            isLearningActivity: true,
            timeUnitId: tu.id,
          },
        },
        name: `Train ${tu.name}`,
      };
      return activity as ActivityData5e;
    });

    const spendAllActivity: any = {
      ...createBaseActivityTemplate(),
      _id: FoundryUtils.randomID(),
      type: "utility",
      img: "icons/svg/coins.svg",
      sort: 100,
      description: {
        chatFlavor: "Spending all available training time",
      },
      flags: {
        "thefehrs-learning-manager": {
          isLearningActivity: true,
          isSpendAll: true,
        },
      },
      name: "Spend all time",
    };
    activities.push(spendAllActivity as ActivityData5e);

    return activities;
  }

  /**
   * Injects training activities into a project item based on world settings.
   */
  static async injectActivities(item: Item5e, forceTarget?: number) {
    const projectData = item.getFlag(Settings.ID, "projectData") as any;

    if (!projectData && forceTarget === undefined) {
      Logger.warn(
        `Cannot inject activities for "${(item as unknown as Item).name}" - missing projectData flag.`,
      );
      return false;
    }

    const target = forceTarget ?? projectData?.target ?? 0;
    const activitiesData = this.getActivitiesData(target);
    const activityUpdates: Record<string, any> = {};

    // 1. Identify existing activities
    const rawActivities = (item.system as any).activities || {};
    const activityList =
      typeof rawActivities?.values === "function"
        ? Array.from(rawActivities.values())
        : Array.isArray(rawActivities)
          ? rawActivities
          : Object.values(rawActivities);

    const existingLearningActivities = (activityList as any[]).filter(
      (a) => a?.flags?.[Settings.ID]?.isLearningActivity,
    );

    // 2. Match and update existing, or create new
    const usedExistingIds = new Set<string>();

    for (const newData of activitiesData) {
      const newTUId = (newData.flags as any)?.[Settings.ID]?.timeUnitId;
      const newIsSpendAll = (newData.flags as any)?.[Settings.ID]?.isSpendAll;

      const match = existingLearningActivities.find((ea) => {
        const eaFlags = ea.flags?.[Settings.ID];
        return newIsSpendAll ? eaFlags?.isSpendAll : eaFlags?.timeUnitId === newTUId;
      });

      if (match) {
        const id = match.id || match._id;
        const final = {
          ...newData,
          _id: id,
        };

        activityUpdates[id] = final;
        usedExistingIds.add(id);
      } else {
        activityUpdates[newData._id] = newData;
      }
    }

    // Note: Removal of orphaned learning activities is deliberately skipped here
    // as dnd5e 3.x migration of the system.activities collection encounters issues
    // with the standard removal notation during silent updates.

    if (Object.keys(activityUpdates).length > 0) {
      try {
        const updateData: Record<string, unknown> = { "system.activities": activityUpdates };
        await item.update(updateData, { render: false });
        return true;
      } catch (err) {
        Logger.error(`Failed to inject activities into "${item.name}":`, true, err);
        return false;
      }
    }
    return false;
  }

  /**
   * Iterates through all actors and regenerates activities for all learning projects.
   */
  static async syncAllProjectActivities() {
    const game = getGame();
    if (!game?.user?.isGM) return;

    const actorsCollection = game.actors;
    const actors =
      typeof (actorsCollection as any).contents !== "undefined"
        ? (actorsCollection as any).contents
        : Array.isArray(actorsCollection)
          ? actorsCollection
          : [];

    const moduleId = Settings.ID;

    let updatedCount = 0;
    let failedCount = 0;

    for (const actor of actors as Actor5e[]) {
      const projects = (actor.items as any).filter((i: any) =>
        i.getFlag(moduleId, "isLearningProject"),
      );

      for (const project of projects) {
        try {
          const success = await this.injectActivities(project as unknown as Item5e);
          if (success) updatedCount++;
        } catch (err) {
          failedCount++;
          Logger.error(
            `Failed to sync activities for project "${project.name}" on actor "${actor.name}":`,
            false,
            err,
          );
        }
      }
    }

    if (failedCount > 0) {
      getUI()?.notifications?.warn(
        `Downtime Engine | Synced activities for ${updatedCount} items. ${failedCount} items failed.`,
      );
    } else {
      getUI()?.notifications?.info(
        `Downtime Engine | Synced activities for ${updatedCount} items.`,
      );
    }
  }
}
