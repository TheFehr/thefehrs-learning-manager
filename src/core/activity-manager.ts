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

    const activities: ActivityData5e[] = timeUnits.map((tu) => ({
      ...createBaseActivityTemplate(),
      _id: FoundryUtils.randomID(),
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
    }));

    activities.push({
      ...createBaseActivityTemplate(),
      _id: FoundryUtils.randomID(),
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
    });

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

    // 2. Match and update existing, or mark for removal if no longer needed
    const usedExistingIds = new Set<string>();

    for (const newActivity of activitiesData) {
      const newTimeUnitId = (newActivity.flags as any)?.[Settings.ID]?.timeUnitId;
      const newIsSpendAll = (newActivity.flags as any)?.[Settings.ID]?.isSpendAll;

      const existingMatch = existingLearningActivities.find((ea) => {
        const eaFlags = ea.flags?.[Settings.ID];
        if (newIsSpendAll) return eaFlags?.isSpendAll;
        return eaFlags?.timeUnitId === newTimeUnitId;
      });

      if (existingMatch) {
        // Reuse the ID and update
        const id = existingMatch.id || existingMatch._id;
        newActivity._id = id;
        activityUpdates[id] = newActivity;
        usedExistingIds.add(id);
      } else {
        // New activity, use its generated ID
        activityUpdates[newActivity._id] = newActivity;
      }
    }

    // 3. Mark for removal any existing learning activities that weren't matched
    for (const ea of existingLearningActivities) {
      const id = ea.id || ea._id;
      if (!usedExistingIds.has(id)) {
        // Use the -= notation for removal
        activityUpdates[`-=${id}`] = null;
      }
    }

    if (Object.keys(activityUpdates).length > 0) {
      await item.update({ "system.activities": activityUpdates } as any);
      Logger.debug(`Successfully synced activities for "${(item as unknown as Item).name}".`);
      return true;
    }
    return false;
  }

  /**
   * Iterates through all actors and regenerates activities for all learning projects.
   */
  static async syncAllProjectActivities() {
    const game = getGame();
    if (!game?.user?.isGM) return;

    // Support both Collection (v12+) and Array (test mocks)
    const actorsCollection = game.actors;
    const actors =
      actorsCollection && typeof (actorsCollection as any).contents !== "undefined"
        ? (actorsCollection as any).contents
        : Array.isArray(actorsCollection)
          ? actorsCollection
          : [];

    const moduleId = Settings.ID;

    let updatedCount = 0;
    let failedCount = 0;

    getUI()?.notifications?.info("Downtime Engine | Syncing project activities...");

    for (const actor of actors) {
      const items = (actor as any).items || [];
      const projects = (
        typeof items.filter === "function" ? items : Array.from(items.values())
      ).filter((i: any) => i.getFlag(moduleId, "isLearningProject")) as Item5e[];

      for (const project of projects) {
        try {
          const result = await this.injectActivities(project);
          if (result) updatedCount++;
        } catch (err) {
          failedCount++;
          Logger.error(`Failed to sync activities for project "${project.name}":`, false, err);
        }
      }
    }

    if (failedCount > 0) {
      getUI()?.notifications?.warn(
        `Downtime Engine | Synced activities for ${updatedCount} items. ${failedCount} items failed (check application logs).`,
      );
    } else {
      getUI()?.notifications?.info(
        `Downtime Engine | Synced activities for ${updatedCount} items.`,
      );
    }
  }
}
