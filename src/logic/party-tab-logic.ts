import { Settings } from "@/core/settings.js";
import { Logger } from "@/core/logger.js";
import { ActorProxy } from "./actor-proxy.js";
import { PartyTabPending } from "./party-tab-pending.js";
import { TabLogic } from "./tab-logic.js";
import { ProjectEngine } from "./project-engine.js";
import { FoundryUtils } from "@/core/foundry-utils.js";
import type { ProjectFlagData, ProjectMappedData } from "./project-item.js";
import type { MemberMappedData } from "@/apps/party-tab.js";
import { isActor5e, type Item5e, type Actor5e } from "@/types.js";
import AbortProjectDialog from "@/apps/dialogs/AbortProjectDialog.svelte";
import CompleteProjectDialog from "@/apps/dialogs/CompleteProjectDialog.svelte";
import GrantTimeDialog from "@/apps/dialogs/GrantTimeDialog.svelte";
import { mount, unmount } from "svelte";
import { getGame, getUI } from "@/core/foundry.js";

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
  static async processGrantTime(
    timeValues: Record<string, number>,
    selectedIds: string[],
  ): Promise<boolean> {
    const timeUnits = Settings.get("timeUnits");
    const totalBase = TabLogic.calculateTotalBaseTime(timeValues, timeUnits);

    if (totalBase === 0) {
      getUI()?.notifications?.warn("No time entered.");
      return false;
    }
    if (selectedIds.length === 0) {
      getUI()?.notifications?.warn("No recipients selected.");
      return false;
    }

    let successCount = 0;
    for (const id of selectedIds) {
      const actor = getGame().actors?.get(id);
      if (!actor || !isActor5e(actor)) continue;
      try {
        const proxy = ActorProxy.forActor(actor);
        const bank = proxy.bank;
        await proxy.setBank({ total: (bank.total || 0) + totalBase });
        successCount++;
      } catch (err) {
        Logger.error(`Failed to update bank for actor ${id}:`, true, err);
      }
    }

    if (successCount === 0) return false;

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
    return true;
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
    let settled = false;

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
            if (settled) return;
            if (svelteInstance) await svelteInstance.submit();
          },
        },
      ],
      position: {
        width: 400,
      },
      close: () => {
        if (svelteInstance) {
          unmount(svelteInstance);
          svelteInstance = undefined;
        }
        settled = true;
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
          onsubmit: async (timeValues: Record<string, number>, selectedIds: string[]) => {
            if (settled) return;
            settled = true;
            try {
              const success = await this.processGrantTime(timeValues, selectedIds);
              if (success) {
                dialog.close();
              } else {
                settled = false;
              }
            } catch (err) {
              settled = false;
              throw err;
            }
          },
        } as unknown as object,
      }) as unknown as GrantTimeInstance;
    }
  }

  private static normalizeActorUuid(uuid: string): `Actor.${string}` {
    if (uuid.startsWith("Actor.")) return uuid as `Actor.${string}`;
    if (uuid.toLowerCase().startsWith("actor."))
      return `Actor.${uuid.slice(6)}` as `Actor.${string}`;
    return `Actor.${uuid}` as `Actor.${string}`;
  }

  /**
   * Manually updates project progress.
   */
  static async updateProgress(
    memberUuid: string,
    project: ProjectMappedData,
    newProgress: number,
    isGM: boolean,
    _parentActor?: Actor,
  ) {
    if (!isGM) return;
    const normalizedUuid = this.normalizeActorUuid(memberUuid);
    const targetActor = (await fromUuid(normalizedUuid)) as Actor5e | undefined;
    if (!targetActor) return;

    const item = targetActor.items.get(project.id);
    if (item) {
      try {
        const projectData = FoundryUtils.deepClone(
          (item.getFlag("thefehrs-learning-manager", "projectData") as ProjectFlagData) || {},
        );
        if (!projectData) return;

        projectData.progress = Math.max(0, Math.min(newProgress, projectData.target || 0));
        // See PartyTabPending's own comment for why this is needed even
        // though the UI also does its own optimistic local update.
        PartyTabPending.setProgress(targetActor.uuid!, item.id!, projectData.progress);
        if (
          projectData.target &&
          projectData.target > 0 &&
          projectData.progress >= projectData.target &&
          !projectData.isCompleted
        ) {
          // Completion ALWAYS renders because it changes item types/recreates
          await ProjectEngine.updateItemWithProgress(
            item as unknown as Item5e,
            projectData,
            "GM Manual Edit",
            true,
          );
          await ProjectEngine.completeProject(item as unknown as Item5e);
        } else {
          // Normal manual update is SILENT to avoid flickering/scroll loss
          await ProjectEngine.updateItemWithProgress(
            item as unknown as Item5e,
            projectData,
            "GM Manual Edit",
            false,
          );
        }
      } catch (err) {
        // The optimistic pending value was recorded above on the assumption
        // the write below would land - since it didn't, leaving it in place
        // would overlay a value that's never going to be confirmed.
        PartyTabPending.clearProgress(targetActor.uuid!, item.id!);
        Logger.error(`Failed to manually update progress for "${item.name}":`, true, err);
      }
    }
  }

  /**
   * Manually updates project target.
   */
  static async updateTarget(
    memberUuid: string,
    project: ProjectMappedData,
    newTarget: number,
    isGM: boolean,
    _parentActor?: Actor,
  ) {
    if (!isGM) return;
    const normalizedUuid = this.normalizeActorUuid(memberUuid);
    const targetActor = (await fromUuid(normalizedUuid)) as Actor5e | undefined;
    if (!targetActor) return;

    const item = targetActor.items.get(project.id);
    if (item) {
      try {
        const projectData = FoundryUtils.deepClone(
          (item.getFlag("thefehrs-learning-manager", "projectData") as ProjectFlagData) || {
            progress: 0,
            target: 0,
          },
        );
        const oldTarget = projectData.target;
        projectData.target = Math.max(0, newTarget);
        Logger.debug(`updateTarget: Setting target to ${projectData.target} for ${item.name}`);
        // See PartyTabPending's own comment for why this is needed even
        // though the UI also does its own optimistic local update.
        PartyTabPending.setTarget(targetActor.uuid!, item.id!, projectData.target);

        if (oldTarget !== projectData.target) {
          if (
            projectData.target &&
            projectData.target > 0 &&
            projectData.progress !== undefined &&
            projectData.progress >= projectData.target
          ) {
            await ProjectEngine.updateItemWithProgress(
              item as unknown as Item5e,
              projectData,
              "GM Manual Edit",
              true,
            );
            await ProjectEngine.completeProject(item as unknown as Item5e);
            return;
          }

          Logger.debug(
            `target changed from ${oldTarget} to ${projectData.target}. Syncing activities...`,
          );
          await ProjectEngine.injectActivities(item as unknown as Item5e, projectData.target);
        }

        // Normal manual update is SILENT to avoid flickering/scroll loss
        await ProjectEngine.updateItemWithProgress(
          item as unknown as Item5e,
          projectData,
          "GM Manual Edit",
          false,
        );
      } catch (err) {
        // See updateProgress's matching catch block for why this is needed.
        PartyTabPending.clearTarget(targetActor.uuid!, item.id!);
        Logger.error(`Failed to manually update target for "${item.name}":`, true, err);
      }
    }
  }

  /**
   * Orchestrates marking a project complete directly, regardless of its
   * current progress - the only prior ways to finish a project were the
   * indirect side effects of dragging progress up to target or target down
   * to progress via the manual-edit controls.
   */
  static async completeProject(
    memberUuid: string,
    project: ProjectMappedData,
    confirmFn?: () => Promise<boolean>,
    isGM?: boolean,
    _parentActor?: Actor,
  ) {
    if (!isGM) return;
    try {
      const normalizedUuid = this.normalizeActorUuid(memberUuid);
      const targetActor = (await fromUuid(normalizedUuid)) as Actor5e | undefined;
      if (!targetActor) return;

      const item = targetActor.items.get(project.id);
      if (!item) return;

      const projectData = FoundryUtils.deepClone(
        (item.getFlag("thefehrs-learning-manager", "projectData") as ProjectFlagData) || {},
      );
      if (!projectData || !projectData.target || projectData.target <= 0) {
        getUI()?.notifications?.warn(
          `Cannot complete "${item.name}": it has no valid target to complete against.`,
        );
        return;
      }

      const projectName = project.name || "Unknown Project";
      const confirmed = confirmFn
        ? await confirmFn()
        : await this.showCompleteConfirm(projectName, targetActor.name || "Unknown Actor");
      if (!confirmed) return;

      projectData.progress = projectData.target;
      // Matches the completion branch updateProgress/updateTarget already
      // take when an edit happens to land on/past target: update the
      // item's own progress display first (render: true, unlike the silent
      // manual-edit path - completion always renders), then hand off to
      // completeProject for the actual type/flag conversion.
      await ProjectEngine.updateItemWithProgress(
        item as unknown as Item5e,
        projectData,
        "GM Manual Edit",
        true,
      );
      await ProjectEngine.completeProject(item as unknown as Item5e);
    } catch (err) {
      Logger.error(`Failed to complete project:`, true, err);
    }
  }

  /**
   * Internal helper to show completion confirmation dialog.
   */
  private static async showCompleteConfirm(
    projectName: string,
    actorName: string,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const container = document.createElement("div");
      let svelteInstance: any = mount(CompleteProjectDialog, {
        target: container,
        props: {
          projectName,
          actorName,
        },
      });

      const dialog = new foundry.applications.api.DialogV2({
        window: {
          title: "Complete Project",
          contentClasses: ["thefehrs-learning-manager-dialog"],
        },
        content: container,
        buttons: [
          {
            action: "yes",
            icon: "fas fa-check",
            label: "Yes",
            default: true,
            callback: () => {
              if (settled) return;
              settled = true;
              resolve(true);
            },
          },
          {
            action: "no",
            icon: "fas fa-times",
            label: "No",
            callback: () => {
              if (settled) return;
              settled = true;
              resolve(false);
            },
          },
        ],
        position: {
          width: 400,
        },
        close: () => {
          if (svelteInstance) {
            unmount(svelteInstance);
            svelteInstance = null;
          }
          if (!settled) {
            settled = true;
            resolve(false);
          }
        },
      });

      dialog.render({ force: true });
    });
  }

  /**
   * Orchestrates project deletion/abortion.
   */
  static async deleteProject(
    memberUuid: string,
    project: ProjectMappedData,
    confirmFn?: () => Promise<boolean>,
    isGM?: boolean,
    parentActor?: Actor,
  ) {
    try {
      const normalizedUuid = this.normalizeActorUuid(memberUuid);
      const targetActor = (await fromUuid(normalizedUuid)) as Actor5e | undefined;
      if (!targetActor || (!targetActor.isOwner && !isGM)) {
        getUI()?.notifications?.warn("You do not have permission to modify this actor's projects.");
        return;
      }

      if ((project.progress || 0) > 0 && !isGM) {
        getUI()?.notifications?.warn("You cannot abort an in-progress project.");
        return;
      }

      const projectName = project.name || "Unknown Project";

      const confirmed = confirmFn
        ? await confirmFn()
        : await this.showDeleteConfirm(projectName, targetActor.name || "Unknown Actor");

      if (confirmed) {
        const item = targetActor.items.get(project.id);
        if (item) {
          await item.delete();
          // Deletion should trigger a render because the row is gone
          if (parentActor) parentActor.render();
        }
      }
    } catch (err) {
      Logger.error(`Failed to delete project:`, true, err);
    }
  }

  /**
   * Internal helper to show deletion confirmation dialog.
   */
  private static async showDeleteConfirm(projectName: string, actorName: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const container = document.createElement("div");
      let svelteInstance: any = mount(AbortProjectDialog, {
        target: container,
        props: {
          projectName,
          actorName,
        },
      });

      const dialog = new foundry.applications.api.DialogV2({
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
            callback: () => {
              if (settled) return;
              settled = true;
              resolve(true);
            },
          },
          {
            action: "no",
            icon: "fas fa-times",
            label: "No",
            callback: () => {
              if (settled) return;
              settled = true;
              resolve(false);
            },
          },
        ],
        position: {
          width: 400,
        },
        close: () => {
          if (svelteInstance) {
            unmount(svelteInstance);
            svelteInstance = null;
          }
          if (!settled) {
            settled = true;
            resolve(false);
          }
        },
      });

      dialog.render({ force: true });
    });
  }
}
