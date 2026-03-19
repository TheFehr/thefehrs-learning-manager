import { Settings } from "./settings";
import { ActorProxy } from "./actor-proxy";
import type { LearningProject, ProjectTemplate, TimeUnit, GuidanceTier } from "./types";

export class ProjectEngine {
  /**
   * Stashes an item as a learning project.
   * Wipes Active Effects and Activities, then appends the isLearningProject flag.
   */
  static async initiateProjectFromItem(
    actor: Actor,
    rewardDoc: Item,
    guidanceTierId: string = "",
  ): Promise<Item | null> {
    const itemData = rewardDoc.toObject();
    const stashedEffects = itemData.effects || [];
    const stashedActivities = itemData.system.activities || {};
    const stashedType = itemData.type;

    const flags = (rewardDoc.getFlag(Settings.ID, "") as any) || {};
    const target = flags.projectData?.target ?? 0;
    const requirements = flags.projectData?.requirements ?? [];

    // Prepare item data for stashing
    const projectData: LearningProject = {
      id: foundry.utils.randomID(),
      templateId: "", // Legacy, no longer used for library lookup
      progress: 0,
      target: target,
      requirements: requirements,
      guidanceTierId: guidanceTierId,
      isCompleted: false,
    };

    const updateData = {
      ...itemData,
      type: "feat",
      effects: [],
      "system.type.value": "learningProject",
      "system.activities": {},
      "flags.thefehrs-learning-manager": {
        isLearningProject: true,
        projectData: projectData,
        stashedEffects: stashedEffects,
        stashedActivities: stashedActivities,
        stashedType: stashedType,
      },
      "flags.tidy5e-sheet.section": "In-Progress Learning",
    };

    const [created] = (await actor.createEmbeddedDocuments("Item", [updateData])) as any[];
    if (!created) {
      console.error(
        `Downtime Engine | Failed to create embedded item "${rewardDoc.name}" on actor ${actor.name}`,
      );
      return null;
    }

    console.debug(
      `Downtime Engine | Created embedded item "${created.name}" (ID: ${created.id}). Injecting activities...`,
    );
    await this.injectActivities(created as any);
    return created as any;
  }

  /**
   * Injects training activities into a project item based on world settings.
   */
  static async injectActivities(item: Item) {
    const flags = (item.getFlag(Settings.ID, "") as any) || {};
    const target = flags.projectData?.target ?? 0;

    console.debug(`Downtime Engine | injectActivities for "${item.name}" (ID: ${item.id})`, {
      target,
      flags,
    });

    if (target <= 0) {
      console.warn(
        `Downtime Engine | Skipping activity injection for "${item.name}" - target is ${target}`,
      );
      return;
    }

    const timeUnits = Settings.timeUnits;
    console.debug(`Downtime Engine | Found ${timeUnits.length} time units in settings`);

    if (timeUnits.length === 0) {
      console.error("Downtime Engine | No time units configured in settings!");
      return;
    }

    const activitiesData = timeUnits.map((tu) => ({
      type: "utility",
      name: `Train ${tu.name}`,
      img: "icons/skills/trades/book-writing-quill.webp",
      activation: { type: "special", value: 1, condition: "" },
      consumption: {
        targets: [],
        scaling: { allowed: false, max: "" },
      },
      description: { chatFlavor: `Training: ${tu.name}` },
      duration: { units: "inst", value: "" },
      range: { units: "self", value: "" },
      target: { template: { count: "", type: "" }, units: "", value: "" },
      uses: { max: "", spent: 0, recovery: [] },
      roll: { formula: "", name: "", prompt: false, visible: false },
      flags: {
        [Settings.ID]: {
          timeUnitId: tu.id,
        },
      },
    }));

    console.debug(`Downtime Engine | Creating ${activitiesData.length} Activity documents...`);
    try {
      const created = await (item as any).createEmbeddedDocuments("Activity", activitiesData);
      console.debug(`Downtime Engine | Successfully created ${created.length} activities.`);
    } catch (err) {
      console.error(`Downtime Engine | Failed to create activities for "${item.name}":`, err);
    }
  }

  /**
   * Creates a project item for an actor from a template and existing project data.
   */
  static async createProjectItem(
    actor: Actor,
    template: ProjectTemplate,
    projectData: LearningProject,
  ): Promise<Item | null> {
    const rewardDoc = await fromUuid(template.rewardUuid as any);
    if (!rewardDoc || !(rewardDoc instanceof Item)) {
      return null;
    }

    const itemData = rewardDoc.toObject();
    const stashedEffects = itemData.effects || [];
    const stashedActivities = itemData.system.activities || {};
    const stashedType = itemData.type;

    const projectDataWithTarget: LearningProject = {
      ...projectData,
      target: projectData.target ?? template.target,
    };

    const updateData = {
      ...itemData,
      type: projectData.isCompleted ? stashedType : "feat",
      effects: [],
      "system.type.value": projectData.isCompleted
        ? itemData.system.type?.value
        : "learningProject",
      "system.activities": {},
      "flags.thefehrs-learning-manager": {
        isLearningProject: !projectData.isCompleted,
        isLearnedReward: projectData.isCompleted,
        projectData: projectDataWithTarget,
        stashedEffects: stashedEffects,
        stashedActivities: stashedActivities,
        stashedType: stashedType,
      },
      "flags.tidy5e-sheet.section": projectData.isCompleted
        ? "Completed Learning"
        : "In-Progress Learning",
    };

    const [created] = (await actor.createEmbeddedDocuments("Item", [updateData])) as any[];
    if (!created) {
      console.error(
        `Downtime Engine | Failed to create embedded item for project data on actor ${actor.name}`,
      );
      return null;
    }

    if (!projectData.isCompleted) {
      console.debug(
        `Downtime Engine | Created project item "${created.name}" (ID: ${created.id}). Injecting activities...`,
      );
      await this.injectActivities(created as any);
    }
    return created as any;
  }

  /**
   * Restores a project item to its original state upon completion.
   */
  static async completeProject(item: Item) {
    const flags = item.getFlag(Settings.ID, "" as any) as any;
    if (!flags?.isLearningProject) return;

    const projectData = {
      ...flags.projectData,
      isCompleted: true,
      progress: flags.projectData.target,
    };

    const updateData = {
      type: flags.stashedType || item.type,
      effects: flags.stashedEffects || [],
      "system.type.value": null, // Will be overridden if stashedActivities restore it or if we restore system
      "system.activities": flags.stashedActivities || {},
      "flags.thefehrs-learning-manager": {
        isLearningProject: false,
        isLearnedReward: true,
        projectData,
        stashedEffects: null,
        stashedActivities: null,
        stashedType: null,
      },
      "flags.tidy5e-sheet.section": "Completed Learning",
    };

    // If it's a feat, we might want to preserve the system.type.value if we had one?
    // Actually, usually restoring stashedActivities might not be enough if we changed system.type.value.
    // The most robust way is to restore the original toObject() but that's risky.
    // For now, let's just restore type.

    await item.update(updateData);
    ui.notifications?.info(`Learning Complete: ${item.name} is now fully available!`);
  }

  /**
   * Processes a training session for a project.
   */
  static async processTraining(item: Item, timeUnitId: string) {
    const actor = item.actor;
    if (!actor) return;

    const flags = item.getFlag(Settings.ID, "" as any) as any;
    if (!flags?.isLearningProject) return;

    const projectData = flags.projectData as LearningProject;
    if (!projectData.target || projectData.target <= 0) {
      return ui.notifications?.warn("This project is awaiting a GM-defined target progress.");
    }

    const tu = Settings.timeUnits.find((u) => u.id === timeUnitId);
    if (!tu) return;

    const proxy = ActorProxy.forActor(actor);
    const bank = proxy.bank;
    if (bank.total < tu.ratio) return ui.notifications?.warn(`Not enough time!`);

    const tier = Settings.guidanceTiers.find((t) => t.id === projectData.guidanceTierId);
    const costCp = tier?.costs?.[tu.id] || 0;
    const cur = proxy.currency;
    const totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (totalCp < costCp) return ui.notifications?.warn(`Need ${costCp}cp!`);

    const rules = Settings.rules;
    const { TabLogic } = await import("./tabs/tab-logic");
    const { progressGained, roll } = await TabLogic.computeProgress(actor as any, rules, tier, tu);

    // Update state
    projectData.progress = Math.min(projectData.progress + progressGained, projectData.target);
    let completedNow = false;
    if (projectData.progress >= projectData.target && !projectData.isCompleted) {
      projectData.isCompleted = true;
      completedNow = true;
    }

    // Transactions
    if (costCp > 0) {
      await TabLogic.deductCurrency(actor, costCp);
    }
    await proxy.setBank({ total: bank.total - tu.ratio });

    if (completedNow) {
      await this.completeProject(item);
    } else {
      await item.update({
        flags: {
          "thefehrs-learning-manager": {
            projectData,
          },
        },
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

    const actors = (game.actors || []) as any[];
    let updatedCount = 0;

    for (const actor of actors) {
      const learningItems = actor.items.filter((i: any) =>
        i.getFlag(Settings.ID, "isLearningProject"),
      );
      for (const item of learningItems) {
        await this.injectActivities(item);
        updatedCount++;
      }
    }

    ui.notifications?.info(`Downtime Engine | Synced activities for ${updatedCount} items.`);
  }
}
