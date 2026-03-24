import { Settings } from "../core/settings.js";
import { ActorProxy } from "../actor-proxy.js";
import { TabLogic } from "../tab-logic.js";
import { ProjectEngine } from "../project-engine.js";
import type { ProjectItem, ProjectFlagData } from "../project-item.js";
import type { MemberMappedData, ProjectMappedData } from "../party-tab.js";
import type { Item5e, Actor5e } from "../types.js";
import AbortProjectDialog from "./dialogs/AbortProjectDialog.svelte";
import GrantTimeDialog from "./dialogs/GrantTimeDialog.svelte";
import { mount, unmount } from "svelte";

/**
 * Logic for the Party Tab component.
 */
export class PartyTabLogic {
  /**
   * Opens an actor's sheet by UUID.
   */
  static async openActorSheet(uuid: string) {
    const doc = await fromUuid(uuid as any);
    if (doc && "sheet" in doc && doc.sheet) {
      (doc.sheet as any).render(true);
    }
  }

  /**
   * Processes the distribution of training time to multiple actors.
   */
  static async processGrantTime(timeValues: Record<string, number>, selectedIds: string[]) {
    const timeUnits = Settings.timeUnits;
    const totalBase = TabLogic.calculateTotalBaseTime(timeValues, timeUnits);

    if (totalBase === 0) return ui.notifications?.warn("No time entered.");
    if (selectedIds.length === 0) return ui.notifications?.warn("No recipients selected.");

    let successCount = 0;
    for (const id of selectedIds) {
      const actor = game.actors?.get(id);
      if (!actor) continue;
      try {
        const proxy = ActorProxy.forActor(actor as unknown as Actor);
        const bank = proxy.bank;
        await proxy.setBank({ total: (bank.total || 0) + totalBase });
        successCount++;
      } catch (err) {
        console.error(`Failed to update bank for actor ${id}:`, err);
      }
    }

    const actionWord = totalBase > 0 ? "Granted" : "Deducted";
    const preposition = totalBase > 0 ? "to" : "from";
    const formattedTime = TabLogic.formatTimeBank(Math.abs(totalBase), timeUnits);

    const chatMessageClass = ChatMessage.implementation as unknown as {
      create: (data: object) => Promise<unknown>;
    };
    await chatMessageClass.create({
      speaker: { alias: "Downtime System" },
      content: `${actionWord} <strong>${formattedTime}</strong> ${preposition} ${successCount} characters.`,
    });
  }

  /**
   * Orchestrates the Grant Time dialog.
   */
  static async grantTime(members: MemberMappedData[], actor: Actor) {
    const timeUnits = Settings.timeUnits;
    const isParty = (actor.type as string) === "group";

    let svelteInstance: any;

    const dialog = new (foundry.applications.api as any).DialogV2({
      window: {
        title: "Modify Training Time",
        contentClasses: ["thefehrs-learning-manager-dialog"],
      },
      content: '<div class="thefehrs-learning-manager-svelte-root"></div>',
      buttons: [
        {
          action: "apply",
          label: "Apply Time",
          icon: "fas fa-check",
          default: true,
          callback: (event: any, button: any, dialogInstance: any) => {
            if (svelteInstance) svelteInstance.submit();
          },
        },
      ],
      position: {
        width: 400,
      },
      close: () => {
        if (svelteInstance) unmount(svelteInstance);
      },
    });

    await dialog.render(true);

    const target = dialog.element.querySelector(".thefehrs-learning-manager-svelte-root");
    if (target) {
      svelteInstance = mount(GrantTimeDialog, {
        target: target as HTMLElement,
        props: {
          timeUnits,
          isParty,
          members,
          onsubmit: (timeValues, selectedIds) => {
            this.processGrantTime(timeValues, selectedIds);
            dialog.close();
          },
        },
      });
    }
  }

  /**
   * Updates the tutelage tier for a project.
   */
  static async updateGuidance(actorId: string, project: ProjectMappedData, tierId: string) {
    const targetActor = game.actors?.get(actorId) as unknown as Actor5e;
    if (!targetActor) return;

    const tiers = Settings.guidanceTiers;
    const tier = tiers.find((tier) => tier.id === tierId);

    const item = targetActor.items.get(project.id);
    if (item) {
      await item.update({
        "flags.thefehrs-learning-manager.projectData.tutelageId": tier?.id ?? "",
      } as any);
    }
  }

  /**
   * Manually updates project progress.
   */
  static async updateProgress(
    actorId: string,
    project: ProjectMappedData,
    newProgress: number,
    isGM: boolean,
  ) {
    if (!isGM) return;
    const targetActor = game.actors?.get(actorId) as unknown as Actor5e;
    if (!targetActor) return;

    const item = targetActor.items.get(project.id);
    if (item) {
      const proxyItem = item as unknown as ProjectItem;
      const projectData = proxyItem.getFlag("thefehrs-learning-manager", "projectData");

      projectData.progress = Math.max(0, Math.min(newProgress, projectData.target || 0));
      if (
        projectData.target > 0 &&
        projectData.progress >= projectData.target &&
        !projectData.isCompleted
      ) {
        await ProjectEngine.completeProject(item as unknown as Item5e);
      } else {
        await ProjectEngine.updateItemWithProgress(item as unknown as Item5e, projectData);
      }
    }
  }

  /**
   * Manually updates project target.
   */
  static async updateTarget(
    actorId: string,
    project: ProjectMappedData,
    newTarget: number,
    isGM: boolean,
  ) {
    if (!isGM) return;
    const targetActor = game.actors?.get(actorId) as unknown as Actor5e;
    if (!targetActor) return;

    const item = targetActor.items.get(project.id);
    if (item) {
      const projectData = (item.getFlag(
        "thefehrs-learning-manager",
        "projectData",
      ) as ProjectFlagData) || { progress: 0, target: 0 };
      const oldTarget = projectData.target;
      projectData.target = Math.max(0, newTarget);
      console.debug(
        `Downtime Engine | updateTarget: Setting target to ${projectData.target} for ${item.name}`,
      );

      if (oldTarget !== projectData.target) {
        console.debug(
          `Downtime Engine | target changed from ${oldTarget} to ${projectData.target}. Syncing activities...`,
        );
        await ProjectEngine.injectActivities(item as unknown as Item5e, projectData.target);
      }

      await ProjectEngine.updateItemWithProgress(item as unknown as Item5e, projectData);
    }
  }

  /**
   * Orchestrates project deletion/abortion.
   */
  static async deleteProject(actorId: string, project: ProjectMappedData, isGM: boolean) {
    const targetActor = game.actors?.get(actorId) as unknown as Actor5e;
    if (!targetActor || !targetActor.isOwner) {
      ui.notifications?.warn("You do not have permission to modify this actor's projects.");
      return;
    }

    if (project.progress > 0 && !isGM) {
      ui.notifications?.warn("You cannot abort an in-progress project.");
      return;
    }

    const projectName = project.name || "Unknown Project";

    const container = document.createElement("div");
    const svelteInstance = mount(AbortProjectDialog, {
      target: container,
      props: {
        projectName,
        actorName: (targetActor as any).name || "Unknown Actor",
      },
    });

    new (foundry.applications.api as any).DialogV2({
      window: {
        title: "Abort Project",
        contentClasses: ["thefehrs-learning-manager-dialog"],
      },
      content: container as HTMLDivElement,
      buttons: [
        {
          action: "yes",
          icon: "fas fa-check",
          label: "Yes",
          default: true,
          callback: async () => {
            const item = targetActor.items.get(project.id);
            if (item) await item.delete();
          },
        },
        {
          action: "no",
          icon: "fas fa-times",
          label: "No",
        },
      ],
      position: {
        width: 400,
      },
      close: () => {
        unmount(svelteInstance);
      },
    }).render(true);
  }
}
