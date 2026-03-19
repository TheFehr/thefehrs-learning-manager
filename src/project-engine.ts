import { Settings } from "./settings";
import { ActorProxy } from "./actor-proxy";
import type { LearningProject, ProjectTemplate, TimeUnit, GuidanceTier } from "./types";

export class ProjectEngine {
  /**
   * Stashes an item as a learning project.
   * Wipes Active Effects and Activities, then appends the isLearningProject flag.
   */
  static async initiateProject(
    actor: Actor,
    template: ProjectTemplate,
    guidanceTierId: string,
  ): Promise<Item | null> {
    const rewardDoc = await fromUuid(template.rewardUuid as any);
    if (!rewardDoc || !(rewardDoc instanceof Item)) {
      ui.notifications?.error("Reward item not found or invalid type.");
      return null;
    }

    const itemData = rewardDoc.toObject();
    const stashedEffects = itemData.effects || [];
    const stashedActivities = itemData.system.activities || {};

    // Prepare item data for stashing
    const projectData: LearningProject = {
      id: foundry.utils.randomID(),
      templateId: template.id,
      progress: 0,
      guidanceTierId: guidanceTierId,
      isCompleted: false,
    };

    const updateData = {
      ...itemData,
      effects: [],
      "system.activities": {},
      "flags.thefehrs-learning-manager": {
        isLearningProject: true,
        projectData: projectData,
        stashedEffects: stashedEffects,
        stashedActivities: stashedActivities,
      },
    };

    const [created] = (await actor.createEmbeddedDocuments("Item", [updateData])) as any[];
    if (!created) return null;

    await this.injectActivities(created as any);
    return created as any;
  }

  /**
   * Injects training activities into a project item based on world settings.
   */
  static async injectActivities(item: Item) {
    const timeUnits = Settings.timeUnits;
    const activities: Record<string, any> = {};

    for (const tu of timeUnits) {
      const activityId = foundry.utils.randomID();
      activities[activityId] = {
        _id: activityId,
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
        "flags.thefehrs-learning-manager.timeUnitId": tu.id,
      };
    }

    await item.update({ system: { activities } });
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

    const updateData = {
      ...itemData,
      effects: [],
      "system.activities": {},
      "flags.thefehrs-learning-manager": {
        isLearningProject: !projectData.isCompleted,
        isLearnedReward: projectData.isCompleted,
        projectData: projectData,
        stashedEffects: stashedEffects,
        stashedActivities: stashedActivities,
      },
    };

    const [created] = (await actor.createEmbeddedDocuments("Item", [updateData])) as any[];
    if (!created) return null;

    if (!projectData.isCompleted) {
      await this.injectActivities(created as any);
    }
    return created as any;
  }

  /**
   * Restores a project item to its original state upon completion.
   */
  static async completeProject(item: Item, template: ProjectTemplate) {
    const flags = item.getFlag(Settings.ID, "" as any) as any;
    if (!flags?.isLearningProject) return;

    const projectData = {
      ...flags.projectData,
      isCompleted: true,
      progress: template.target,
    };

    const updateData = {
      effects: flags.stashedEffects || [],
      "system.activities": flags.stashedActivities || {},
      "flags.thefehrs-learning-manager": {
        isLearningProject: false,
        isLearnedReward: true,
        projectData,
        stashedEffects: null,
        stashedActivities: null,
      },
    };

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
    const template = Settings.projectTemplates.find((t) => t.id === projectData.templateId);
    if (!template) return ui.notifications?.warn("Project template missing!");

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
    projectData.progress = Math.min(projectData.progress + progressGained, template.target);
    let completedNow = false;
    if (projectData.progress >= template.target && !projectData.isCompleted) {
      projectData.isCompleted = true;
      completedNow = true;
    }

    // Transactions
    if (costCp > 0) {
      await TabLogic.deductCurrency(actor, costCp);
    }
    await proxy.setBank({ total: bank.total - tu.ratio });

    if (completedNow) {
      await this.completeProject(item, template);
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
        flavor: `${actor.name} tries to learn ${template.name} (DC ${rules.checkDC})`,
      });
    }

    if (progressGained === 0) {
      ui.notifications?.info("Training unsuccessful - no progress gained.");
    }
  }
}
