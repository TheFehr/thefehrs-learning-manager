import { Settings } from "@/core/settings.js";
import { Logger } from "@/core/logger.js";
import { ActorProxy } from "./actor-proxy.js";
import { TabLogic } from "./tab-logic.js";
import { ProjectEngine } from "./project-engine.js";
import type { ProjectItem, ProjectFlagData } from "./project-item.js";
import type { MemberMappedData, ProjectMappedData } from "@/apps/party-tab.js";
import { isActor5e, type Item5e, type Actor5e } from "@/types.js";
import AbortProjectDialog from "@/apps/dialogs/AbortProjectDialog.svelte";
import GrantTimeDialog from "@/apps/dialogs/GrantTimeDialog.svelte";
import { mount, unmount } from "svelte";

/**
 * Logic for the Party Tab component.
 */
export class PartyTabLogic {
  /**
   * Opens an actor's sheet by UUID.
   */
  static async openActorSheet(uuid: string) {
    const doc = await fromUuid(uuid as `Actor.${string}`);
    if (doc && "sheet" in doc && doc.sheet) {
      (doc.sheet as { render: (force: boolean) => unknown }).render(true);
    }
  }

  /**
   * Processes the distribution of training time to multiple actors.
   */
  static async processGrantTime(timeValues: Record<string, number>, selectedIds: string[]) {
    const timeUnits = Settings.get("timeUnits");
    const totalBase = TabLogic.calculateTotalBaseTime(timeValues, timeUnits);

    if (totalBase === 0) return ui.notifications?.warn("No time entered.");
    if (selectedIds.length === 0) return ui.notifications?.warn("No recipients selected.");

    let successCount = 0;
    for (const id of selectedIds) {
      const actor = game.actors.get(id);
      if (!actor || !isActor5e(actor)) continue;
      try {
        const proxy = ActorProxy.forActor(actor);
        const bank = proxy.bank;
        await proxy.setBank({ total: (bank.total || 0) + totalBase });
        successCount++;
      } catch (err) {
        Logger.error(`Failed to update bank for actor ${id}:`, err);
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
    ProjectEngine.signalTimeDistribution();
  }

  /**
   * Orchestrates the Grant Time dialog.
   */
  static async grantTime(members: MemberMappedData[], actor: Actor) {
    const timeUnits = Settings.get("timeUnits");
    const isParty = (actor.type as string) === "group";

    interface GrantTimeInstance {
      submit: () => void;
    }
    let svelteInstance: GrantTimeInstance | undefined;

    const dialog = new foundry.applications.api.DialogV2({
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
          callback: async (_event, _button, _dialog) => {
            if (svelteInstance) await svelteInstance.submit();
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

    await dialog.render({ force: true });

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
   * Manually updates project progress.
   */
  static async updateProgress(
    actorId: string,
    project: ProjectMappedData,
    newProgress: number,
    isGM: boolean,
  ) {
    if (!isGM) return;
    const targetActor = game.actors.get(actorId) as Actor5e;
    if (!targetActor) return;

    const item = targetActor.items.get(project.id);
    if (item) {
      const proxyItem = item as unknown as ProjectItem;
      const projectData = proxyItem.getFlag("thefehrs-learning-manager", "projectData");
      if (!projectData) return;

      projectData.progress = Math.max(0, Math.min(newProgress, projectData.target || 0));
      if (
        projectData.target &&
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
    const targetActor = game.actors?.get(actorId) as Actor5e | undefined;
    if (!targetActor) return;

    const item = targetActor.items.get(project.id);
    if (item) {
      const projectData = (item.getFlag(
        "thefehrs-learning-manager",
        "projectData",
      ) as ProjectFlagData) || { progress: 0, target: 0 };
      const oldTarget = projectData.target;
      projectData.target = Math.max(0, newTarget);
      Logger.debug(`updateTarget: Setting target to ${projectData.target} for ${item.name}`);

      if (oldTarget !== projectData.target) {
        if (
          projectData.target &&
          projectData.target > 0 &&
          projectData.progress !== undefined &&
          projectData.progress >= projectData.target
        ) {
          await ProjectEngine.updateItemWithProgress(item as unknown as Item5e, projectData);
          await ProjectEngine.completeProject(item as unknown as Item5e);
          return;
        }

        Logger.debug(
          `target changed from ${oldTarget} to ${projectData.target}. Syncing activities...`,
        );
        await ProjectEngine.injectActivities(item as unknown as Item5e, projectData.target);
      }

      await ProjectEngine.updateItemWithProgress(item as unknown as Item5e, projectData);
    }
  }

  /**
   * Orchestrates project deletion/abortion.
   */
  static async deleteProject(
    actorId: string,
    project: ProjectMappedData,
    isGM: boolean,
    confirmFn?: () => Promise<boolean>,
  ) {
    const targetActor = game.actors?.get(actorId) as Actor5e | undefined;
    if (!targetActor || !targetActor.isOwner) {
      ui.notifications?.warn("You do not have permission to modify this actor's projects.");
      return;
    }

    if (project.progress > 0 && !isGM) {
      ui.notifications?.warn("You cannot abort an in-progress project.");
      return;
    }

    const projectName = project.name || "Unknown Project";

    const confirmed = confirmFn
      ? await confirmFn()
      : await this.showDeleteConfirm(projectName, targetActor.name || "Unknown Actor");

    if (confirmed) {
      const item = targetActor.items.get(project.id);
      if (item) await item.delete();
    }
  }

  /**
   * Internal helper to show deletion confirmation dialog.
   */
  private static async showDeleteConfirm(projectName: string, actorName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const container = document.createElement("div");
      const svelteInstance = mount(AbortProjectDialog, {
        target: container,
        props: {
          projectName,
          actorName,
        },
      });

      new foundry.applications.api.DialogV2({
        window: {
          title: "Abort Project",
          contentClasses: ["thefehrs-learning-manager-dialog"],
        },
        content: container,
        buttons: [
          {
            action: "yes",
            icon: "fas fa-check",
            label: "Yes",
            default: true,
            callback: () => resolve(true),
          },
          {
            action: "no",
            icon: "fas fa-times",
            label: "No",
            callback: () => resolve(false),
          },
        ],
        position: {
          width: 400,
        },
        close: () => {
          unmount(svelteInstance);
          resolve(false);
        },
      }).render({ force: true });
    });
  }
}
