import { Settings } from "./core/settings.js";
import { ActorProxy } from "./actor-proxy.js";
import {
  LearningActivityData,
  LearningFeatType,
  ProjectFlagData,
  ProjectItem,
} from "./project-item.js";
import type { Actor5e, Item5e, ActivityData5e, LearningActor } from "./types.js";

export class ProjectEngine {
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

    const projectItem = rewardDoc as unknown as ProjectItem;
    const projectDataFlags = projectItem.getFlag("thefehrs-learning-manager", "projectData");
    const target = projectDataFlags?.target ?? 0;
    const stashedRequirements = projectDataFlags?.requirements ?? [];

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
    };

    const updateData = {
      ...itemData,
      type: "feat",
      effects: [],
      system: {
        activities: {},
        type: {
          value: LearningFeatType,
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
      updateData as never,
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
    await this.injectActivities(createdItem, projectData.target);
    return createdItem;
  }

  /**
   * Generates training activities data based on world settings.
   */
  static getActivitiesData(target: number): ActivityData5e[] {
    if (target <= 0) return [];

    const timeUnits = Settings.timeUnits;
    return timeUnits.map((tu) => ({
      _id: "", // Will be assigned by foundry
      img: "icons/svg/book.svg",
      sort: 0,
      override: false,
      concentration: false,
      prompt: false,
      type: "utility",
      activation: {
        type: "special",
        override: false,
        condition: "",
        value: 1,
      },
      consumption: {
        value: "1",
        scaling: {
          allowed: false,
          max: "",
        },
        spellSlot: false,
        targets: [],
      },
      description: {
        chatFlavor: `Training for ${tu.name}`,
      },
      duration: {
        value: "1",
        units: "perm",
        concentration: false,
        override: false,
        special: "",
      },
      effects: [],
      flags: {
        "thefehrs-learning-manager": {
          isLearningActivity: true,
          timeUnitId: tu.id,
        },
      },
      range: {
        value: "0",
        units: "self",
        override: false,
        special: "",
      },
      target: {
        template: {
          count: "1",
          size: "0",
          width: "0",
          height: "0",
          contiguous: false,
          units: "ft",
          type: "",
        },
        affects: {
          count: "1",
          choice: false,
          type: "",
          special: "",
        },
        override: false,
        prompt: false,
      },
      uses: {
        spent: 0,
        recovery: [],
        max: "",
      },
      visibility: {
        identifier: "",
        level: {
          min: null,
          max: null,
        },
        requireAttunement: false,
        requireIdentification: false,
        requireMagic: false,
      },
      name: `Train ${tu.name}`,
    }));
  }

  /**
   * Injects training activities into a project item based on world settings.
   */
  static async injectActivities(item: Item5e, forceTarget?: number) {
    const itemProxy = item as unknown as ProjectItem;
    const projectData = itemProxy.getFlag("thefehrs-learning-manager", "projectData");
    const target = forceTarget ?? projectData.target ?? 0;

    const activitiesData = this.getActivitiesData(target);

    if (activitiesData.length === 0) {
      console.warn(
        `Downtime Engine | Skipping activity injection for "${(item as unknown as Item).name}" - target is ${target}.`,
      );
      return;
    }

    try {
      const activityUpdates: Record<string, ActivityData5e> = {};

      for (const activity of activitiesData) {
        const id = (foundry.utils as unknown as { randomID: () => string }).randomID();
        activity._id = id;
        activityUpdates[id] = activity;
      }

      // @ts-expect-error - system.activities update
      await (item as unknown as Item).update({ "system.activities": activityUpdates });
      console.debug(
        `Downtime Engine | Successfully created ${Object.keys(activityUpdates).length} activities.`,
      );
    } catch (err) {
      console.error(
        `Downtime Engine | Failed to create activities for "${(item as unknown as Item).name}":`,
        err,
      );
    }
  }

  /**
   * Restores a project item to its original state upon completion.
   */
  static async completeProject(item: Item5e) {
    const isProject = item.getFlag("thefehrs-learning-manager", "isLearningProject");
    if (!isProject) return;
    const projectItem = item as unknown as ProjectItem;

    const projectDataFlags = projectItem.getFlag("thefehrs-learning-manager", "projectData");

    const updateData = {
      type: (item.getFlag("thefehrs-learning-manager", "stashedType") as string) || item.type,
      effects: (item.getFlag("thefehrs-learning-manager", "stashedEffects") as object[]) || [],
      "system.type.value": null,
      "system.activities":
        (item.getFlag("thefehrs-learning-manager", "stashedActivities") as object) || {},
      "flags.thefehrs-learning-manager": {
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
      },
      "flags.tidy5e-sheet.section": "Completed Learning",
    };

    // @ts-expect-error - Complex document update
    await (item as unknown as Item).update(updateData);
    ui.notifications?.info(
      `Learning Complete: ${(item as unknown as Item).name} is now fully available!`,
    );
  }

  /**
   * Processes a training session for a project.
   */
  static async processTraining(learningActivity: LearningActivityData) {
    const item = learningActivity.item;

    const actor = item.actor;
    if (!actor) return;

    const projectDataFlags = item.getFlag("thefehrs-learning-manager", "projectData");
    if (!projectDataFlags.target || projectDataFlags.target <= 0) {
      return ui.notifications?.warn("This project is awaiting a GM-defined target progress.");
    }

    const flags = learningActivity.flags["thefehrs-learning-manager"];
    const timeUnitId = flags?.timeUnitId;
    const tu = Settings.timeUnits.find((u) => u.id === timeUnitId);
    if (!tu) return;

    const proxy = ActorProxy.forActor(actor as unknown as Actor);
    const bank = proxy.bank;
    if (bank.total < tu.ratio) return ui.notifications?.warn(`Not enough time!`);

    const tier = Settings.guidanceTiers.find((t) => t.id === projectDataFlags.tutelageId);
    const costCp = tier?.costs?.[tu.id] || 0;
    const cur = proxy.currency;
    const totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (totalCp < costCp) return ui.notifications?.warn(`Need ${costCp}cp!`);

    const rules = Settings.rules;
    const { TabLogic } = await import("./tab-logic.js");
    const { progressGained, roll } = await TabLogic.computeProgress(
      actor as unknown as LearningActor,
      rules,
      tier,
      tu,
    );

    // Update state
    projectDataFlags.progress = Math.min(
      projectDataFlags.progress + progressGained,
      projectDataFlags.target,
    );
    let completedNow = false;
    if (projectDataFlags.progress >= projectDataFlags.target && !projectDataFlags.isCompleted) {
      projectDataFlags.isCompleted = true;
      completedNow = true;
    }

    // Transactions
    if (costCp > 0) {
      await TabLogic.deductCurrency(actor as unknown as Actor, costCp);
    }
    await proxy.setBank({ total: bank.total - tu.ratio });

    if (completedNow) {
      await this.completeProject(item as unknown as Item5e);
    } else {
      await (item as unknown as Item).update({
        [`flags.${Settings.ID}.projectData`]: projectDataFlags,
      });
    }

    if (roll) {
      await roll.toMessage({
        flavor: `${actor.name} tries to learn ${item.name} (DC ${rules.checkDC})`,
      });
    }

    if (progressGained === 0) {
      ui.notifications?.info("Training unsuccessful - no progress gained.");
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

    for (const actor of actors) {
      const learningItems = (actor as unknown as Actor).items.filter((i) =>
        i.getFlag("thefehrs-learning-manager", "isLearningProject"),
      ) as unknown as Item5e[];
      for (const item of learningItems) {
        await this.injectActivities(item);
        updatedCount++;
      }
    }

    ui.notifications?.info(`Downtime Engine | Synced activities for ${updatedCount} items.`);
  }
}
