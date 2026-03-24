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
    const stashedName = itemData.name || "";
    const stashedDescription = itemData.system.description?.value || "";
    const stashedSystem = itemData.system || {};
    const stashedSourceUuid = (rewardDoc as any).uuid || "";

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

    const progressHtml = this.generateProgressHtml(0, target, tutelageName);

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

  static generateProgressHtml(progress: number, target: number, tutelageName: string): string {
    const percentage = Math.min(100, Math.max(0, (progress / target) * 100));
    return `<!-- learning-manager:progress-start -->
<div class="learning-manager-progress-container" style="margin: 0.5rem 0 1rem 0; padding: 0.5rem; border: 1px solid var(--t5e-faint-color); border-radius: 4px; background: var(--t5e-background); font-family: var(--t5e-font-family);">
  <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 4px; font-size: 0.75rem; color: var(--t5e-secondary-color);">
    <span>Training Progress (${tutelageName})</span>
    <span>${progress} / ${target}</span>
  </div>
  <div style="width: 100%; height: 12px; background: rgba(0,0,0,0.1); border-radius: 6px; overflow: hidden; position: relative;">
    <div style="width: ${percentage}%; height: 100%; background: var(--t5e-hp-bar-color, #4caf50); transition: width 0.4s ease-in-out;"></div>
  </div>
</div>
<!-- learning-manager:progress-end -->`;
  }

  static stripProgressHtml(html: string): string {
    if (!html) return "";
    let clean = html;

    // 1. Remove by comments (global)
    clean = clean.replace(
      /<!-- learning-manager:progress-start -->[\s\S]*?<!-- learning-manager:progress-end -->/g,
      "",
    );

    // 2. Remove by class (fallback if comments are gone or mangled)
    const classRegex =
      /<[^>]*class="[^"]*learning-manager-progress-container[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/g;
    while (classRegex.test(clean)) {
      clean = clean.replace(classRegex, "");
    }

    return clean.trim();
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
      const activityUpdates: Record<string, any> = {};

      // 1. Identify and mark for removal any existing learning activities
      const existingActivities = (item.system as any).activities;
      if (existingActivities && typeof existingActivities.forEach === "function") {
        existingActivities.forEach((activity: any) => {
          if (activity.flags?.["thefehrs-learning-manager"]?.isLearningActivity) {
            activityUpdates[`-=${activity.id}`] = null;
          }
        });
      }

      // 2. Add the new activities
      for (const activity of activitiesData) {
        const id = (foundry.utils as unknown as { randomID: () => string }).randomID();
        activity._id = id;
        activityUpdates[id] = activity;
      }

      // @ts-expect-error - complex activities update
      await (item as unknown as Item).update({ "system.activities": activityUpdates });
      console.debug(
        `Downtime Engine | Successfully synced activities for "${(item as unknown as Item).name}".`,
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
    const actor = item.actor;
    if (!actor) return;

    const projectDataFlags = projectItem.getFlag("thefehrs-learning-manager", "projectData");
    const stashedSourceUuid = projectDataFlags.stashedSourceUuid;

    let sourceItem: Item5e | null = null;
    if (stashedSourceUuid) {
      try {
        sourceItem = (await fromUuid(stashedSourceUuid as any)) as unknown as Item5e | null;
      } catch (e) {
        console.warn(`Downtime Engine | Could not find source item ${stashedSourceUuid}`);
      }
    }

    const completedFlags = {
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
        stashedName: null,
        stashedDescription: null,
        stashedSystem: null,
        stashedSourceUuid: null,
      },
      "flags.tidy5e-sheet.section": "Completed Learning",
    };

    if (sourceItem && sourceItem instanceof Item) {
      // Primary Restoration: Create a new copy from the source item
      const sourceData = sourceItem.toObject();
      const createData = {
        ...sourceData,
        ...completedFlags,
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
        if (typeof (created as any).displayCard === "function") {
          await (created as any).displayCard({ rollMode: Settings.rules.rollMode });
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
    const activityUpdates: Record<string, any> = {};
    const existingActivities = (item.system as any).activities;
    if (existingActivities && typeof existingActivities.forEach === "function") {
      existingActivities.forEach((activity: any) => {
        if (activity.flags?.["thefehrs-learning-manager"]?.isLearningActivity) {
          activityUpdates[`-=${activity.id}`] = null;
        }
      });
    }

    // Restore from stashed system, overriding activities with our deletions
    const stashedSystem =
      (item.getFlag("thefehrs-learning-manager", "stashedSystem" as any) as object) || {};
    const restoredSystem = {
      ...stashedSystem,
      activities: {
        ...(item.getFlag("thefehrs-learning-manager", "stashedActivities" as any) as object),
        ...activityUpdates,
      },
    };

    const updateData = {
      name: projectDataFlags.stashedName || (item as unknown as Item).name,
      type:
        (item.getFlag("thefehrs-learning-manager", "stashedType" as any) as string) || item.type,
      effects:
        (item.getFlag("thefehrs-learning-manager", "stashedEffects" as any) as object[]) || [],
      system: restoredSystem,
      ...completedFlags,
    };

    await (item as unknown as Item).update(updateData as any);
    ui.notifications?.info(
      `Learning Complete: ${(item as unknown as Item).name} is now fully available!`,
    );
    if (typeof (item as any).displayCard === "function") {
      await (item as any).displayCard({ rollMode: Settings.rules.rollMode });
    }
  }

  /**
   * Processes a training session for a project.
   * @param learningActivity The activity data to process.
   * @returns A promise that resolves to true if the training was processed successfully, false otherwise.
   */
  static async processTraining(learningActivity: LearningActivityData): Promise<boolean> {
    const item = learningActivity.item;

    const actor = item.actor;
    if (!actor) return false;

    const projectDataFlags = item.getFlag("thefehrs-learning-manager", "projectData");
    if (!projectDataFlags.target || projectDataFlags.target <= 0) {
      ui.notifications?.warn("This project is awaiting a GM-defined target progress.");
      return false;
    }

    const flags = learningActivity.flags["thefehrs-learning-manager"];
    const timeUnitId = flags?.timeUnitId;
    const tu = Settings.timeUnits.find((u) => u.id === timeUnitId);
    if (!tu) return false;

    const proxy = ActorProxy.forActor(actor as unknown as Actor);
    const bank = proxy.bank;
    if (bank.total < tu.ratio) {
      ui.notifications?.warn(`Not enough time!`);
      return false;
    }

    const tier = Settings.guidanceTiers.find((t) => t.id === projectDataFlags.tutelageId);
    if (!tier) {
      ui.notifications?.warn("Please select a tutelage tier for this project.");
      return false;
    }

    // If it's a bulk unit, ensure the tier actually provides progress for it
    if (tu.isBulk) {
      const bulkProgress = tier.progress?.[tu.id] || 0;
      if (bulkProgress <= 0) {
        ui.notifications?.warn(
          `The "${tier.name}" tier provides no progress for ${tu.name} sessions.`,
        );
        return false;
      }
    }

    const costCp = tier.costs?.[tu.id] || 0;
    const cur = proxy.currency;
    const totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (totalCp < costCp) {
      ui.notifications?.warn(`Need ${costCp}cp!`);
      return false;
    }

    const { TabLogic } = await import("./tab-logic.js");

    // Confirmation before spending currency
    if (costCp > 0) {
      const formattedCost = TabLogic.formatCurrency(costCp);
      const confirmed = await (foundry.applications.api as any).DialogV2.confirm({
        window: { title: "Confirm Tutelage Cost" },
        content: `<p>This training session requires <b>${formattedCost}</b> in tutelage fees. Spend currency and proceed?</p>`,
        rejectClose: false,
        modal: true,
      });
      if (!confirmed) return false;
    }

    // Transactions - Deduct currency first
    if (costCp > 0) {
      const success = await TabLogic.deductCurrency(actor as unknown as Actor, costCp);
      if (!success) return false; // TabLogic.deductCurrency handles the warning
    }

    const rules = Settings.rules;
    const { progressGained, roll, reason } = await TabLogic.computeProgress(
      actor as unknown as LearningActor,
      rules,
      tier,
      tu,
    );

    // Calculate raw progress and excess
    const rawProgress = projectDataFlags.progress + progressGained;
    const excessProgress = Math.max(0, rawProgress - projectDataFlags.target);

    // Update state
    projectDataFlags.progress = Math.min(rawProgress, projectDataFlags.target);
    let completedNow = false;
    if (projectDataFlags.progress >= projectDataFlags.target && !projectDataFlags.isCompleted) {
      projectDataFlags.isCompleted = true;
      completedNow = true;
    }

    // Deduct time from bank
    await proxy.setBank({ total: bank.total - tu.ratio });

    if (completedNow) {
      await this.completeProject(item as unknown as Item5e);

      if (excessProgress > 0 && projectDataFlags.followUpProjectId) {
        // ... follow up logic remains unchanged ...
        const followUpItem = (await fromUuid(
          projectDataFlags.followUpProjectId as any,
        )) as unknown as Item5e | null;
        if (followUpItem && "getFlag" in followUpItem) {
          const proceed = await (foundry.applications.api as any).DialogV2.confirm({
            window: { title: "Learning Progress Exceeded" },
            content: `<p>You generated <strong>${excessProgress}</strong> more progress than needed to complete <strong>${item.name}</strong>.</p>
                      <p>Would you like to immediately apply it towards the follow-up project: <strong>${(followUpItem as any).name}</strong>?</p>`,
            rejectClose: false,
          });

          if (proceed) {
            const { TabLogic } = await import("./tab-logic.js");
            const followUpFlags = (followUpItem as any).getFlag(
              "thefehrs-learning-manager",
              "projectData",
            ) as ProjectFlagData | undefined;
            const reqs = followUpFlags?.requirements || [];
            const { eligible, reason: reqReason } = TabLogic.meetsRequirements(
              actor as unknown as Actor,
              reqs,
            );

            if (!eligible) {
              ui.notifications?.warn(
                `Could not start follow-up project: Requirements not met for ${
                  (followUpItem as any).name
                }: ${reqReason}`,
              );
            } else {
              const newItem = await this.initiateProjectFromItem(
                actor as unknown as Actor,
                followUpItem as unknown as Item,
                projectDataFlags.tutelageId,
              );
              if (newItem) {
                const newFlags = (newItem as unknown as ProjectItem).getFlag(
                  "thefehrs-learning-manager",
                  "projectData",
                );
                newFlags.progress = Math.min(
                  excessProgress,
                  newFlags.target > 0 ? newFlags.target : excessProgress,
                );
                await this.updateItemWithProgress(newItem, newFlags);
                ui.notifications?.info(
                  `Started follow-up project: ${(followUpItem as any).name} with ${
                    newFlags.progress
                  } initial progress.`,
                );
              }
            }
          }
        }
      }
    } else {
      await this.updateItemWithProgress(item as unknown as Item5e, projectDataFlags);

      // Ensure we have the latest document instance before displaying the card
      const freshItem = (actor as unknown as Actor).items.get(item.id) as unknown as Item5e;
      if (freshItem && typeof (freshItem as any).displayCard === "function") {
        await (freshItem as any).displayCard({ rollMode: rules.rollMode });
      }
    }

    if (roll) {
      await roll.toMessage(
        {
          flavor: `${actor.name} tries to learn ${item.name} (DC ${rules.checkDC})`,
        },
        { rollMode: (rules.rollMode as any) || "gmroll" },
      );
    }

    if (progressGained === 0) {
      const msg = reason
        ? `Training unsuccessful: ${reason}`
        : "Training unsuccessful - no progress gained.";
      ui.notifications?.info(msg);
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
    const progressHtml = this.generateProgressHtml(
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
    } as any);
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
