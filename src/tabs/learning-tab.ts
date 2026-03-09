import { Settings } from "../settings";
import { ActorProxy } from "../actor-proxy";
import { TabLogic } from "./tab-logic";

export class LearningTab {
  static async getData(actor: Actor) {
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

    const allProjects = proxy.projects
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
        };
      })
      .filter((p: any) => p !== null);

    return {
      formattedBank: TabLogic.formatTimeBank(bank.total, timeUnits),
      timeUnits,
      activeProjects: allProjects.filter((p: any) => !p.isCompleted),
      completedProjects: allProjects.filter((p: any) => p.isCompleted),
      library,
      isGM: game.user?.isGM,
    };
  }

  static activateListeners(html: HTMLElement, actor: Actor) {
    TabLogic.activateListeners(html, actor);
  }
}
