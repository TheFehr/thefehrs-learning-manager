import { Settings } from "../settings";
import { ActorProxy } from "../actor-proxy";
import { TabLogic } from "./tab-logic";

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
          tierCostInfo: tier ? tier.costs : null,
          canAbort: p.progress === 0,
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
    // Bulk Training Listener
    html.querySelectorAll(".bulk-train").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        const target = ev.currentTarget as HTMLElement | null;
        if (!target || !target.dataset) return;

        const { id, unit } = target.dataset;
        if (!id || !unit) return;

        await TabLogic.processTraining(actor as any, id, unit);
      });
    });

    // Add Project Listener
    const addBtn = html.querySelector(".add-selected-project");
    if (addBtn) {
      addBtn.addEventListener("click", async () => {
        const selectedId = (html.querySelector(".project-selector") as HTMLSelectElement)?.value;
        if (!selectedId) return;
        const library = Settings.projectTemplates;
        const tpl = library.find((t) => t.id === selectedId);

        if (tpl) {
          const { eligible, reason } = TabLogic.meetsRequirements(actor, tpl.requirements || []);
          if (!eligible) {
            ui.notifications?.warn(`Requirement not met for ${tpl.name}: ${reason}`);
            return;
          }

          const proxy = ActorProxy.forActor(actor);
          const projects = proxy.projects;
          projects.push({
            id: foundry.utils.randomID(),
            templateId: tpl.id,
            progress: 0,
            guidanceTierId: "",
            isCompleted: false,
          });
          await proxy.setProjects(projects);
        }
      });
    }

    // Delete Project Listener
    html.querySelectorAll(".delete-project").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        const target = ev.currentTarget as HTMLElement | null;
        if (!target || !target.dataset) return;

        const { id, actorId } = target.dataset;
        if (!id) return;

        const targetActor = actorId ? (game.actors?.get(actorId) as Actor) : actor;
        if (!targetActor) return;

        // Check if user has permission to modify this actor
        if (!targetActor.isOwner) {
          ui.notifications?.warn("You do not have permission to modify this actor's projects.");
          return;
        }

        const proxy = ActorProxy.forActor(targetActor);
        const projects = proxy.projects;
        const project = projects.find((p: any) => p.id === id);

        if (!project) return;

        if (project.progress > 0 && !game.user?.isGM) {
          ui.notifications?.warn("You cannot abort an in-progress project.");
          return;
        }

        const library = Settings.projectTemplates;
        const tpl = library.find((t) => t.id === project.templateId);
        const projectName = tpl ? tpl.name : "Unknown Project";

        const escapedProjectName = foundry.utils.escapeHTML(projectName);
        const escapedActorName = foundry.utils.escapeHTML(targetActor.name);

        new foundry.appv1.api.Dialog({
          title: "Abort Project",
          content: `<p>Are you sure you want to abort the project <strong>${escapedProjectName}</strong> for <strong>${escapedActorName}</strong>?</p><p>Any progress will be lost.</p>`,
          buttons: {
            yes: {
              icon: '<i class="fas fa-check"></i>',
              label: "Yes",
              callback: async () => {
                const updatedProjects = projects.filter((p: any) => p.id !== id);
                await proxy.setProjects(updatedProjects);
              },
            },
            no: {
              icon: '<i class="fas fa-times"></i>',
              label: "No",
            },
          },
          default: "no",
        }).render(true);
      });
    });

    // Guidance Tier Change Listener
    html.querySelectorAll(".update-project").forEach((select) => {
      select.addEventListener("change", async (ev) => {
        const target = ev.currentTarget as HTMLSelectElement | null;
        if (!target || !target.dataset) return;

        const { actorId, projectId } = target.dataset;
        if (!actorId || !projectId) return;
        const val = target.value;
        const targetActor = game.actors?.get(actorId as string) as Actor | undefined;
        if (!targetActor) {
          ui.notifications?.warn("Target actor not found");
          return;
        }
        const proxy = ActorProxy.forActor(targetActor);
        const projects = proxy.projects;
        const p = projects.find((x) => x.id === projectId);
        const tiers = Settings.guidanceTiers;
        const tier = tiers.find((t) => t.id === val);

        if (p) {
          if (val && !tier) {
            ui.notifications?.warn(`Guidance tier ${val} not found`);
            return;
          }
          p.guidanceTierId = tier?.id ?? "";
          await proxy.setProjects(projects);
        }
      });
    });
  }
}
