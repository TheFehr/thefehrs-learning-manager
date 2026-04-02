import { Settings } from "./settings.js";
import { BASE_ACTIVITY_TEMPLATE } from "./constants.js";
import type { Actor5e, Item5e, ActivityData5e } from "../types.js";
import type { ProjectItem } from "../project-item.js";

export class ActivityManager {
  /**
   * Generates training activities data based on world settings.
   */
  static getActivitiesData(target: number): ActivityData5e[] {
    if (target <= 0) return [];

    const timeUnits = Settings.timeUnits;
    const activities: ActivityData5e[] = timeUnits.map((tu) => ({
      ...structuredClone(BASE_ACTIVITY_TEMPLATE),
      _id: "", // Will be assigned by foundry
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
      ...structuredClone(BASE_ACTIVITY_TEMPLATE),
      _id: "",
      img: "icons/svg/clockwork.svg",
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
      console.warn(
        `Downtime Engine | Cannot inject activities for "${(item as unknown as Item).name}" - missing projectData flag.`,
      );
      return;
    }

    const activitiesData = this.getActivitiesData(target);

    try {
      const activityUpdates: Record<string, any> = {};

      // 1. Identify and mark for removal any existing learning activities
      const system = item.system as unknown as {
        activities?: {
          forEach: (
            cb: (activity: { id: string; flags?: Record<string, unknown> }) => void,
          ) => void;
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

      if (activitiesData.length === 0) {
        console.debug(
          `Downtime Engine | Clearing activities for "${(item as unknown as Item).name}" (target is ${target}).`,
        );
      } else {
        // 2. Add the new activities
        for (const activity of activitiesData) {
          const id = (foundry.utils as unknown as { randomID: () => string }).randomID();
          activity._id = id;
          activityUpdates[id] = activity;
        }
      }

      if (Object.keys(activityUpdates).length > 0) {
        // @ts-expect-error - complex activities update
        await (item as unknown as Item).update({ "system.activities": activityUpdates });
        console.debug(
          `Downtime Engine | Successfully synced activities for "${(item as unknown as Item).name}".`,
        );
      }
    } catch (err) {
      console.error(
        `Downtime Engine | Failed to create activities for "${(item as unknown as Item).name}":`,
        err,
      );
    }
  }

  /**
   * Iterates through all actors and regenerates activities for all learning projects.
   * Useful when time units change in settings.
   */
  static async syncAllProjectActivities() {
    if (!game.user?.isGM) return;

    ui.notifications?.info("Downtime Engine | Syncing project activities...");

    const actors = (game.actors || []) as unknown as Actor5e[];
    let updatedCount = 0;
    let failedCount = 0;

    for (const actor of actors) {
      const learningItems = (actor as unknown as Actor).items.filter((i) =>
        i.getFlag("thefehrs-learning-manager", "isLearningProject"),
      ) as unknown as Item5e[];
      const chunkedPromises = learningItems.map(async (item) => {
        try {
          await this.injectActivities(item);
          updatedCount++;
        } catch (err) {
          console.error(
            `Downtime Engine | Failed to sync activities for item "${item.name}" on actor "${actor.name}":`,
            err,
          );
          failedCount++;
        }
      });
      await Promise.all(chunkedPromises);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (failedCount > 0) {
      ui.notifications?.warn(
        `Downtime Engine | Synced activities for ${updatedCount} items. ${failedCount} items failed (see console).`,
      );
    } else {
      ui.notifications?.info(`Downtime Engine | Synced activities for ${updatedCount} items.`);
    }
  }
}
