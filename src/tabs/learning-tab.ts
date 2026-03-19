import { Settings } from "../settings";
import { ActorProxy } from "../actor-proxy";
import { TabLogic } from "./tab-logic";
import type { LearningProject } from "../types";

export class LearningTab {
  static getData(actor: Actor) {
    if (!actor) {
      return {
        formattedBank: "0",
        timeUnits: [],
        activeProjects: [],
        completedProjects: [],
        library: [],
        isGM: game.user?.isGM,
      };
    }
    const proxy = ActorProxy.forActor(actor);
    const timeUnits = Settings.timeUnits;
    const bank = proxy.bank;

    // Evaluate the library for this specific actor
    const library = Settings.projectTemplates.map((tpl) => {
      const eligibility = TabLogic.meetsRequirements(actor, tpl.requirements || []);
      const label = `${tpl.name} (${tpl.target})${!eligibility.eligible ? " - Locked" : ""}`;
      return {
        ...tpl,
        isEligible: eligibility.eligible,
        ineligibilityReason: eligibility.reason,
        label,
        disabled: !eligibility.eligible,
        title: !eligibility.eligible ? eligibility.reason : "",
      };
    });

    const flagProjects = proxy.projects
      .map((p: any) => {
        const tier = Settings.guidanceTiers.find((t) => t.id === p.guidanceTierId);
        const tpl = library.find((t) => t.id === p.templateId);
        if (!tpl) return null;

        return {
          ...p,
          name: tpl.name,
          maxProgress: tpl.target,
          percent: tpl.target > 0 ? Math.min((p.progress / tpl.target) * 100, 100) : 0,
          isCompleted: p.progress >= tpl.target || p.isCompleted,
          guidanceType: tier ? tier.name : "None",
          tierCostInfo: tier ? tier.costs : null,
          canAbort: p.progress === 0 || game.user?.isGM,
          isItemBased: false,
        };
      })
      .filter((p: any) => p !== null);

    const itemProjects = (actor.items as unknown as any[])
      .filter(
        (i) =>
          i.getFlag(Settings.ID, "isLearningProject") || i.getFlag(Settings.ID, "isLearnedReward"),
      )
      .map((i) => {
        const flags = i.getFlag(Settings.ID, "" as any) as any;
        const projectData = flags.projectData as LearningProject;
        const tpl = Settings.projectTemplates.find((t) => t.id === projectData.templateId);
        if (!tpl) return null;

        const tier = Settings.guidanceTiers.find((t) => t.id === projectData.guidanceTierId);

        return {
          ...projectData,
          id: i.id,
          name: i.name,
          maxProgress: tpl.target,
          percent: tpl.target > 0 ? Math.min((projectData.progress / tpl.target) * 100, 100) : 0,
          isCompleted: projectData.isCompleted || flags.isLearnedReward,
          guidanceType: tier ? tier.name : "None",
          tierCostInfo: tier ? tier.costs : null,
          canAbort: (projectData.progress === 0 && !flags.isLearnedReward) || game.user?.isGM,
          isItemBased: true,
        };
      })
      .filter((p) => p !== null);

    const allProjects = [...flagProjects, ...itemProjects];

    return {
      formattedBank: TabLogic.formatTimeBank(bank.total, timeUnits),
      timeUnits,
      activeProjects: allProjects.filter((p: any) => !p.isCompleted),
      completedProjects: allProjects.filter((p: any) => p.isCompleted),
      library,
      isGM: game.user?.isGM,
    };
  }
}
