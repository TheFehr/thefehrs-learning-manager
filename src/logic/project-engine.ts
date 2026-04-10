import { Settings } from "../core/settings.js";
import { Logger } from "../core/logger.js";
import { ActorProxy } from "./actor-proxy.js";
import { ActivityManager } from "../core/activity-manager.js";
import { ProjectLifecycle } from "./project-lifecycle.js";
import { LearningActivityData, ProjectFlagData, ProjectItem } from "./project-item.js";
import type { Item5e, Actor5e, LearningActor, TimeUnit, SystemRules } from "../types.js";
import { Socket } from "../core/socket.js";
import { mount, unmount } from "svelte";
import { TutelageResolverService } from "./tutelage-resolver.js";
import InstructorSelectionDialog from "../apps/dialogs/InstructorSelectionDialog.svelte";

import { ProjectUI } from "../core/project-ui.js";

export class ProjectEngine {
  /**
   * Forwards call to ProjectUI
   */
  static generateProgressHtml(progress: number, target: number, tutelageName: string): string {
    return ProjectUI.generateProgressHtml(progress, target, tutelageName);
  }

  /**
   * Forwards call to ProjectUI
   */
  static stripProgressHtml(html: string): string {
    return ProjectUI.stripProgressHtml(html);
  }

  /**
   * Forwards call to ActivityManager
   */
  static getActivitiesData(target: number) {
    return ActivityManager.getActivitiesData(target);
  }

  /**
   * Forwards call to ActivityManager
   */
  static async injectActivities(item: Item5e, forceTarget?: number) {
    return ActivityManager.injectActivities(item, forceTarget);
  }

  /**
   * Forwards call to ActivityManager
   */
  static async syncAllProjectActivities() {
    return ActivityManager.syncAllProjectActivities();
  }

  /**
   * Forwards call to ProjectLifecycle
   */
  static async initiateProjectFromItem(actor: Actor, rewardDoc: Item): Promise<Item5e | null> {
    return (await ProjectLifecycle.initiateProjectFromItem(actor, rewardDoc)) as any as Item5e;
  }

  /**
   * Forwards call to ProjectLifecycle
   */
  static async completeProject(item: Item5e) {
    return ProjectLifecycle.completeProject(item);
  }

  /**
   * Forwards call to ProjectLifecycle
   */
  static async updateItemWithProgress(
    item: Item5e,
    projectData: ProjectFlagData,
    instructorName: string = "None",
  ) {
    return ProjectLifecycle.updateItemWithProgress(item, projectData, instructorName);
  }

  static _tabLogicModule: any = null;

  static async importTabLogic() {
    if (this._tabLogicModule) return this._tabLogicModule;
    this._tabLogicModule = await import("./tab-logic");
    return this._tabLogicModule;
  }

  /**
   * Processes spending all available training time from largest to smallest unit.
   */
  static async processSpendAll(item: Item5e, allowedUnitIds?: string[]) {
    const actor = item.actor;
    if (!actor) return false;

    const proxy = ActorProxy.forActor(actor);
    const bank = proxy.bank;
    if (!bank.total || bank.total <= 0) {
      if (!allowedUnitIds) {
        Logger.warn("No training time in your bank!");
      } else {
        Logger.debug("No training time in bank, skipping auto-spend.");
      }
      return false;
    }

    // system.activities can be a Map, Collection, or Array depending on document state/version
    const rawActivities = item.system.activities as
      | Map<unknown, unknown>
      | Array<unknown>
      | Record<string, unknown>;
    const activityList =
      typeof rawActivities?.values === "function"
        ? Array.from(rawActivities.values())
        : Array.isArray(rawActivities)
          ? rawActivities
          : Object.values(rawActivities || {});

    const activities = (activityList as LearningActivityData[])
      .filter(
        (a) => a?.flags?.[Settings.ID]?.isLearningActivity && !a?.flags?.[Settings.ID]?.isSpendAll,
      )
      .map((a) => {
        const unitId = a.flags?.[Settings.ID]?.timeUnitId;
        const timeUnits = Settings.get("timeUnits");
        const unit = timeUnits.find((u) => u.id === unitId);
        return { activity: a, ratio: unit?.ratio || 0, unitId, name: unit?.name };
      })
      .filter((a) => a.ratio > 0 && (!allowedUnitIds || allowedUnitIds.includes(a.unitId || "")))
      .sort((a, b) => b.ratio - a.ratio);

    if (activities.length === 0) {
      if (!allowedUnitIds)
        ui.notifications?.warn("No valid training activities found for this project.");
      return false;
    }

    // If manual (no allowedUnitIds), ask for confirmation
    if (!allowedUnitIds) {
      const { TabLogic } = await this.importTabLogic();
      const formattedTime = TabLogic.formatTimeBank(bank.total, Settings.get("timeUnits"));
      const safeFormattedTime = foundry.utils.escapeHTML(formattedTime);
      const safeItemName = foundry.utils.escapeHTML(item.name);

      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Confirm Spend All Time" },
        content: `<p>Are you sure you want to spend <b>all</b> your available training time (<b>${safeFormattedTime}</b>) on <b>${safeItemName}</b>?</p>`,
        rejectClose: false,
        modal: true,
      });
      if (!confirmed) return false;
    }

    let iterations = 0;
    const maxIterations = 100;
    let anySuccess = false;
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 10;

    while (iterations < maxIterations) {
      const currentBank = proxy.bank.total || 0;
      const fitting = activities.find((a) => a.ratio <= currentBank);

      if (!fitting) break;

      const result = await this.processTraining(fitting.activity, { skipPrompt: true });
      if (!result) {
        Logger.warn(
          `Failed to process training for "${fitting.name}" unit in Spend All loop. Skipping...`,
        );
        consecutiveFailures++;
        if (consecutiveFailures >= maxConsecutiveFailures) {
          const msg = `Spend All loop aborted after ${consecutiveFailures} consecutive failures.`;
          Logger.error(msg);
          break;
        }
        iterations++;
        continue;
      }

      // Defensive check: ensure bank actually decreased
      const newBank = proxy.bank.total || 0;
      if (newBank >= currentBank) {
        const msg = `Spend All loop detected no decrease in bank total after successful training for "${fitting.name}". Aborting to prevent infinite loop.`;
        Logger.error(msg);
        break;
      }

      anySuccess = true;
      consecutiveFailures = 0;

      const updatedProject = actor.items.get(item.id) as unknown as ProjectItem | undefined;
      if (!updatedProject || !updatedProject.system?.activities) break;

      const isCompleted = updatedProject.getFlag(Settings.ID, "projectData")?.isCompleted;
      if (isCompleted) break;

      iterations++;
    }

    if (iterations >= maxIterations) {
      const msg = `processSpendAll reached maximum iterations (${maxIterations}) for project "${item.name}". Possible infinite loop logic or extremely large bank.`;
      Logger.warn(msg);
    }

    return anySuccess;
  }

  /**
   * Processes a training session for a project.
   * @param learningActivity The activity data to process.
   * @param options Optional configuration for the training process.
   * @returns A promise that resolves to true if the training was processed successfully, false otherwise.
   */
  static async processTraining(
    learningActivity: LearningActivityData,
    options: { skipPrompt?: boolean } = {},
  ): Promise<boolean> {
    const item = learningActivity.item;

    const actor = item.actor;
    if (!actor) return false;

    // Handle "Spend all" activity
    if (learningActivity.flags?.[Settings.ID]?.isSpendAll) {
      return await this.processSpendAll(item as any);
    }

    const projectDataFlags = item.getFlag("thefehrs-learning-manager", "projectData");
    if (!projectDataFlags.target || projectDataFlags.target <= 0) {
      ui.notifications?.warn("This project is awaiting a GM-defined target progress.");
      return false;
    }

    const flags = learningActivity.flags["thefehrs-learning-manager"];
    const timeUnitId = flags?.timeUnitId;
    const timeUnits = Settings.get("timeUnits");
    const tu = timeUnits.find((u) => u.id === timeUnitId);
    if (!tu) return false;

    const proxy = ActorProxy.forActor(actor);
    const bank = proxy.bank;
    if (bank.total < tu.ratio) {
      ui.notifications?.warn(`Not enough time!`);
      return false;
    }

    const instructors = await TutelageResolverService.getAvailableInstructors(item as any);
    const books = TutelageResolverService.getAvailableBooks(actor, item as any);
    const bestBookMod = books.reduce((max, b) => Math.max(max, b.modifier), 0);
    const bestBooks = books.filter((b) => b.modifier === bestBookMod && bestBookMod > 0);
    const bestBookNames = bestBooks.map((b) => b.name).join(", ");

    let selectedInstructor = null;
    let rememberChoice = false;

    if (instructors.length > 0 || bestBookMod > 0) {
      const lastId = projectDataFlags.lastInstructorUuid;
      const lastName = projectDataFlags.lastInstructorName;

      const remembered = instructors.find(
        (i) => i.actorUuid === lastId && i.offering.name === lastName,
      );

      if (options.skipPrompt && remembered) {
        selectedInstructor = remembered;
      } else if (!options.skipPrompt) {
        let dialogInstance: any;
        const choice = (await new Promise((resolve) => {
          const dialog = new (foundry.applications.api.DialogV2 as any)({
            window: {
              title: `Select Instructor: ${item.name}`,
              contentClasses: ["thefehrs-learning-manager-dialog"],
            },
            content: '<div class="ude-instructor-dialog-root"></div>',
            buttons: [
              {
                action: "confirm",
                label: "Confirm",
                default: true,
                callback: (_event: any, _button: any, _dialog: any) => {
                  resolve(dialogInstance?.getResult());
                },
              },
              {
                action: "cancel",
                label: "Cancel",
                callback: () => resolve("cancel"),
              },
            ],
            close: () => {
              if (dialogInstance) unmount(dialogInstance);
              resolve(null);
            },
            modal: true,
            rejectClose: false,
          });

          dialog.render({ force: true }).then(() => {
            const root = dialog.element.querySelector(".ude-instructor-dialog-root");
            if (root) {
              Logger.debug("ProjectEngine | Mounting InstructorSelectionDialog to dialog root.");
              dialogInstance = mount(InstructorSelectionDialog, {
                target: root,
                props: {
                  instructors,
                  bestBookMod,
                  bestBookNames,
                  timeUnit: tu,
                  lastInstructorUuid: lastId,
                  lastInstructorName: lastName,
                  resolve: () => {},
                },
              });
            } else {
              Logger.error(
                "ProjectEngine | Could not find ude-instructor-dialog-root in dialog element!",
                dialog.element,
              );
            }
          });
        })) as any;

        if (!choice || choice === "cancel") return false;
        selectedInstructor = choice.instructor;
        rememberChoice = choice.remember;
      }
    }

    const resolution = TutelageResolverService.resolveTutelage(
      actor,
      item as any,
      selectedInstructor?.actorUuid,
      selectedInstructor?.offering.name,
    );
    const tutelageMod = resolution.modifier;
    const costCp = resolution.costs[tu.id] || 0;
    const instructorName = resolution.instructorName;

    if (rememberChoice) {
      projectDataFlags.lastInstructorUuid = selectedInstructor?.actorUuid || "";
      projectDataFlags.lastInstructorName = selectedInstructor?.offering.name || "Self-Study";
    }

    const cur = proxy.currency;
    const totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (totalCp < costCp) {
      ui.notifications?.warn(`Need ${costCp}cp!`);
      return false;
    }

    const { TabLogic } = await this.importTabLogic();

    const rules = Settings.get("rules");
    let isSeparate = false;

    if (
      !options.skipPrompt &&
      tu.isBulk &&
      rules.nonBulkMethod === "roll" &&
      rules.bulkMethod !== "roll"
    ) {
      const bulkResult = await TabLogic.computeProgress(actor, rules, tutelageMod, tu);
      const prob = await TabLogic.calculateSuccessProbability(actor, rules, tutelageMod);
      const chancePercent = Math.round(prob * 100);
      const expectedFromSeparate = (tu.ratio * prob).toFixed(1);

      const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: `Training Resolution: ${tu.name}` },
        content: this._renderTrainingResolutionDialog(
          tu,
          bulkResult.progressGained,
          chancePercent,
          expectedFromSeparate,
          rules,
        ),
        buttons: [
          { action: "bulk", label: `Use Bulk`, icon: "fas fa-calculator" },
          { action: "separate", label: `Roll separately`, icon: "fas fa-dice-d20" },
        ],
        rejectClose: false,
        modal: true,
      });
      if (!choice) return false;
      isSeparate = choice === "separate";
    }

    // Confirmation before spending currency
    if (costCp > 0) {
      const formattedCost = TabLogic.formatCurrency(costCp);
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Confirm Tutelage Cost" },
        content: `<p>This training session requires <b>${formattedCost}</b> in tutelage fees. Spend currency and proceed?</p>`,
        rejectClose: false,
        modal: true,
      });
      if (!confirmed) return false;
    }

    // Transactions - Deduct currency first
    if (costCp > 0) {
      const success = await TabLogic.deductCurrency(actor, costCp);
      if (!success) return false; // TabLogic.deductCurrency handles the warning
    }

    let totalProgressGained = 0;
    let rolls: Roll[] = [];
    let reasons: string[] = [];

    const iterations = isSeparate ? tu.ratio : 1;
    const baseTu = isSeparate ? { ...tu, isBulk: false, ratio: 1 } : tu;

    for (let i = 0; i < iterations; i++) {
      const result = await TabLogic.computeProgress(actor, rules, tutelageMod, baseTu);
      totalProgressGained += result.progressGained;
      if (result.roll) rolls.push(result.roll);
      if (result.reason) reasons.push(result.reason);
    }

    // Calculate raw progress and excess
    const rawProgress = projectDataFlags.progress + totalProgressGained;
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
      await this.completeProject(item as any);

      if (excessProgress > 0 && projectDataFlags.followUpProjectId) {
        const followUpItem = (await fromUuid(
          projectDataFlags.followUpProjectId as `Item.${string}`,
        )) as unknown as Item | null;
        if (followUpItem) {
          const escapedItemName = foundry.utils.escapeHTML(item.name || "");
          const escapedFollowUpName = foundry.utils.escapeHTML(followUpItem.name || "");

          const proceed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Learning Progress Exceeded" },
            content: `<p>You generated <strong>${excessProgress}</strong> more progress than needed to complete <strong>${escapedItemName}</strong>.</p>
                      <p>Would you like to immediately apply it towards the follow-up project: <strong>${escapedFollowUpName}</strong>?</p>`,
            rejectClose: false,
          });

          if (proceed) {
            const followUpFlags = followUpItem.getFlag("thefehrs-learning-manager", "projectData");
            const reqs = followUpFlags?.requirements || [];
            const { eligible, reason: reqReason } = TabLogic.meetsRequirements(actor, reqs);

            if (!eligible) {
              ui.notifications?.warn(
                `Could not start follow-up project: Requirements not met for ${escapedFollowUpName}: ${reqReason}`,
              );
            } else {
              const newItem = await this.initiateProjectFromItem(actor, followUpItem);
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
                  `Started follow-up project: ${foundry.utils.escapeHTML(followUpItem.name)} with ${
                    newFlags.progress
                  } initial progress.`,
                );
              }
            }
          }
        }
      }
    } else {
      await this.updateItemWithProgress(item as any, projectDataFlags, instructorName);

      // Ensure we have the latest document instance before displaying the card
      const freshItem = actor.items.get(item.id);
      if (freshItem && typeof (freshItem as any).displayCard === "function") {
        await (freshItem as any).displayCard({ rollMode: rules.rollMode });
      }
    }

    const BATCH_THRESHOLD = 5;
    if (isSeparate && tu.ratio > BATCH_THRESHOLD) {
      const successCount = rolls.filter((r) => r.total >= (rules.checkDC ?? 12)).length;
      ui.notifications?.info(
        `Training complete: Gained ${totalProgressGained} progress from ${tu.ratio} separate rolls (${successCount} successes).`,
      );
    } else {
      for (const r of rolls) {
        await r.toMessage(
          {
            flavor: `${actor.name} tries to learn ${item.name} (DC ${rules.checkDC ?? 12})`,
          },
          { rollMode: (rules.rollMode || "gmroll") as foundry.dice.RollMode },
        );
      }
    }

    if (totalProgressGained === 0) {
      const msg =
        reasons.length > 0
          ? `Training unsuccessful: ${reasons[0]}`
          : "Training unsuccessful - no progress gained.";
      ui.notifications?.info(msg);
    } else if (isSeparate && tu.ratio <= BATCH_THRESHOLD) {
      ui.notifications?.info(
        `Training complete: Gained ${totalProgressGained} progress from ${tu.ratio} separate rolls.`,
      );
    }

    return true;
  }

  /**
   * Executed on every client when the signal is received.
   */
  static async handleAutoTrainSignal() {
    const autoSpendEnabled = Settings.get("autoSpend");
    const autoSpendUnits = Settings.get("autoSpendUnits");

    if (!autoSpendEnabled || game.user?.isGM) return;

    const actor = game.user.character;
    if (!actor) return;

    const projects = actor.items.filter((i) => i.getFlag(Settings.ID, "isLearningProject"));

    if (projects.length === 1) {
      const project = projects[0];
      await this.processSpendAll(project as any, autoSpendUnits);
    } else if (projects.length > 1) {
      ui.notifications?.warn(
        "Downtime Engine | You have auto-spending enabled, but more than one active project. Please open your character sheet and spend the time yourself.",
      );
    }
  }

  /**
   * GM triggers this when granting time to the party.
   */
  static signalTimeDistribution() {
    Socket.emitSignal("timeGrantedSignal");
  }

  private static _renderTrainingResolutionDialog(
    tu: TimeUnit,
    bulkProgress: number,
    chancePercent: number,
    expectedFromSeparate: string,
    rules: SystemRules,
  ): string {
    const safeTuName = foundry.utils.escapeHTML(tu.name);
    return `
      <div style="margin-bottom: 1rem;">
        <p>How would you like to resolve this <b>${safeTuName}</b> session?</p>
        <div style="display: flex; gap: 1rem; flex-direction: column;">
          <div style="padding: 0.5rem; border: 1px solid var(--t5e-faint-color); border-radius: 4px; background: rgba(0,0,0,0.05);">
            <i class="fas fa-calculator"></i> <b>Bulk Method</b>: Gaining <strong>${bulkProgress}</strong> progress fixed.
          </div>
          <div style="padding: 0.5rem; border: 1px solid var(--t5e-faint-color); border-radius: 4px; background: rgba(0,0,0,0.05);">
            <i class="fas fa-dice-d20"></i> <b>Separate Rolls</b>: Each hour has a <strong>${chancePercent}%</strong> chance of success (DC ${rules.checkDC ?? 12}).
            <br><small style="opacity: 0.8;">Statistically expected progress: ${expectedFromSeparate} across ${tu.ratio} rolls.</small>
          </div>
        </div>
      </div>
    `;
  }
}
