import { Settings } from "./settings.js";
import { Logger } from "./logger.js";
import { FoundryUtils } from "./foundry-utils.js";
import { createBaseActivityTemplate } from "./constants.js";
import type { Actor5e, Item5e, ActivityData5e } from "@/types.js";
import type { ProjectItem } from "@/logic/project-item.js";
import { getGame, getUI } from "./foundry.js";

export class ActivityManager {
  /**
   * Configurable delay between actor updates in batch operations to avoid overwhelming systems.
   * Default is 50ms. Set to 0 to disable throttling.
   */
  static actorUpdateDelayMs = 50;

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

    // Add "Spend all" activity
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
    const itemProxy = item as unknown as ProjectItem;
    const projectData = itemProxy.getFlag("thefehrs-learning-manager", "projectData");

    const target = forceTarget ?? projectData?.target ?? 0;

    if (!projectData && forceTarget === undefined) {
      Logger.warn(
        `Cannot inject activities for "${(item as unknown as Item).name}" - missing projectData flag.`,
      );
      return false;
    }

    const activitiesData = this.getActivitiesData(target);

    const activityUpdates: Record<string, any> = {};

    // 1. Identify and mark for removal any existing learning activities
    const existingActivities = item.system.activities as any;
    if (existingActivities) {
      // system.activities can be a Map, Collection, or Array depending on document state/version
      const activityList =
        typeof existingActivities.values === "function"
          ? Array.from(existingActivities.values())
          : Array.isArray(existingActivities)
            ? existingActivities
            : Object.values(existingActivities);

      for (const activity of activityList as any[]) {
        if (activity?.id && activity.flags?.["thefehrs-learning-manager"]?.isLearningActivity) {
          activityUpdates[`-=${activity.id}`] = null;
        }
      }
    }

    if (activitiesData.length === 0) {
      Logger.debug(
        `Clearing activities for "${(item as unknown as Item).name}" (target is ${target}).`,
      );
    } else {
      // 2. Add the new activities (IDs already generated in getActivitiesData)
      for (const activity of activitiesData) {
        activityUpdates[activity._id] = activity;
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
   * Useful when time units change in settings.
   */
  static async syncAllProjectActivities() {
    const game = getGame();
    if (!game?.user?.isGM) return;

    getUI()?.notifications?.info("Downtime Engine | Syncing project activities...");

    const actors = (game.actors || []) as unknown as Actor5e[];
    let updatedCount = 0;
    let failedCount = 0;

    for (const actor of actors) {
      const learningItems = (actor as unknown as Actor).items.filter((i: any) =>
        i.getFlag("thefehrs-learning-manager", "isLearningProject"),
      ) as unknown as Item5e[];

      for (const item of learningItems) {
        try {
          const result = await this.injectActivities(item);
          if (result === true) {
            updatedCount++;
          }
        } catch (err) {
          Logger.error(
            `Failed to sync activities for item "${item.name}" on actor "${actor.name}":`,
            true,
            err,
          );
          failedCount++;
        }
      }

      // Pause to rate-limit/backoff and avoid overwhelming
      // downstream systems (Foundry database writes, client updates) during batch updates.
      // Can be tuned via ActivityManager.actorUpdateDelayMs.
      if (ActivityManager.actorUpdateDelayMs > 0 && learningItems.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, ActivityManager.actorUpdateDelayMs));
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
