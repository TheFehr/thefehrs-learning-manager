import { Settings } from "./core/settings.js";
import { ActorProxy } from "./actor-proxy.js";
import { ActivityManager } from "./core/activity-manager.js";
import { ProjectLifecycle } from "./project-lifecycle.js";
import { LearningActivityData, ProjectFlagData, ProjectItem } from "./project-item.js";
import type { Item5e, LearningActor } from "./types.js";
import { Socket } from "./core/socket";

import { ProjectUI } from "./core/project-ui.js";

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
  static async initiateProjectFromItem(
    actor: Actor,
    rewardDoc: Item,
    tutelageId: string = "",
  ): Promise<Item5e | null> {
    return ProjectLifecycle.initiateProjectFromItem(actor, rewardDoc, tutelageId);
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
  static async updateItemWithProgress(item: Item5e, projectData: ProjectFlagData) {
    return ProjectLifecycle.updateItemWithProgress(item, projectData);
  }

  /**
   * Processes spending all available training time from largest to smallest unit.
   */
  static async processSpendAll(item: Item5e, allowedUnitIds?: string[]) {
    const actor = item.actor;
    if (!actor) return false;

    const proxy = ActorProxy.forActor(actor as unknown as Actor);
    const bank = proxy.bank;
    if (!bank.total || bank.total <= 0) {
      if (!allowedUnitIds) ui.notifications?.warn("No training time in your bank!");
      return false;
    }

    const activities = (item.system.activities as unknown as LearningActivityData[])
      .filter(
        (a) => a.flags?.[Settings.ID]?.isLearningActivity && !a.flags?.[Settings.ID]?.isSpendAll,
      )
      .map((a) => {
        const unitId = a.flags?.[Settings.ID]?.timeUnitId;
        const unit = Settings.timeUnits.find((u) => u.id === unitId);
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
      const { TabLogic } = await import("./tab-logic.js");
      const formattedTime = TabLogic.formatTimeBank(bank.total, Settings.timeUnits);
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Confirm Spend All Time" },
        content: `<p>Are you sure you want to spend <b>all</b> your available training time (<b>${formattedTime}</b>) on <b>${item.name}</b>?</p>`,
        rejectClose: false,
        modal: true,
      });
      if (!confirmed) return false;
    }

    let iterations = 0;
    const maxIterations = 100;
    let anySuccess = false;

    while (iterations < maxIterations) {
      const currentBank = proxy.bank.total || 0;
      const fitting = activities.find((a) => a.ratio <= currentBank);

      if (!fitting) break;

      const result = await this.processTraining(fitting.activity, { skipPrompt: true });
      if (!result) break;
      anySuccess = true;

      const updatedProject = actor.items.get(item.id) as ProjectItem | undefined;
      if (!updatedProject || !updatedProject.system?.activities) break;

      const isCompleted = updatedProject.getFlag(Settings.ID, "projectData")?.isCompleted;
      if (isCompleted) break;

      iterations++;
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
      return await this.processSpendAll(item as unknown as Item5e);
    }

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
    if (tu.isBulk && Settings.rules.bulkMethod === "direct") {
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

    const rules = Settings.rules;
    let isSeparate = false;

    if (
      !options.skipPrompt &&
      tu.isBulk &&
      rules.nonBulkMethod === "roll" &&
      rules.bulkMethod !== "roll"
    ) {
      const bulkResult = await TabLogic.computeProgress(actor, rules, tier, tu);
      const prob = await TabLogic.calculateSuccessProbability(actor, rules, tier);
      const chancePercent = Math.round(prob * 100);
      const expectedFromSeparate = (tu.ratio * prob).toFixed(1);

      const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: `Training Resolution: ${tu.name}` },
        content: `
          <div style="margin-bottom: 1rem;">
            <p>How would you like to resolve this <b>${tu.name}</b> session?</p>
            <div style="display: flex; gap: 1rem; flex-direction: column;">
              <div style="padding: 0.5rem; border: 1px solid var(--t5e-faint-color); border-radius: 4px; background: rgba(0,0,0,0.05);">
                <i class="fas fa-calculator"></i> <b>Bulk Method</b>: Gaining <strong>${bulkResult.progressGained}</strong> progress fixed.
              </div>
              <div style="padding: 0.5rem; border: 1px solid var(--t5e-faint-color); border-radius: 4px; background: rgba(0,0,0,0.05);">
                <i class="fas fa-dice-d20"></i> <b>Separate Rolls</b>: Each hour has a <strong>${chancePercent}%</strong> chance of success (DC ${rules.checkDC}).
                <br><small style="opacity: 0.8;">Statistically expected progress: ${expectedFromSeparate} across ${tu.ratio} rolls.</small>
              </div>
            </div>
          </div>
        `,
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
      const success = await TabLogic.deductCurrency(actor as unknown as Actor, costCp);
      if (!success) return false; // TabLogic.deductCurrency handles the warning
    }

    let totalProgressGained = 0;
    let rolls: Roll[] = [];
    let reasons: string[] = [];

    const iterations = isSeparate ? tu.ratio : 1;
    const baseTu = isSeparate ? { ...tu, isBulk: false, ratio: 1 } : tu;

    for (let i = 0; i < iterations; i++) {
      const result = await TabLogic.computeProgress(actor, rules, tier, baseTu);
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
      await this.completeProject(item as unknown as Item5e);

      if (excessProgress > 0 && projectDataFlags.followUpProjectId) {
        const followUpItem = (await fromUuid(projectDataFlags.followUpProjectId)) as Item5e | null;
        if (followUpItem && "getFlag" in followUpItem) {
          const escapedItemName = foundry.utils.escapeHTML(item.name || "");
          const escapedFollowUpName = foundry.utils.escapeHTML(followUpItem.name || "");

          const proceed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Learning Progress Exceeded" },
            content: `<p>You generated <strong>${excessProgress}</strong> more progress than needed to complete <strong>${escapedItemName}</strong>.</p>
                      <p>Would you like to immediately apply it towards the follow-up project: <strong>${escapedFollowUpName}</strong>?</p>`,
            rejectClose: false,
          });

          if (proceed) {
            const { TabLogic } = await import("./tab-logic.js");
            const followUpFlags = followUpItem.getFlag("thefehrs-learning-manager", "projectData");
            const reqs = followUpFlags?.requirements || [];
            const { eligible, reason: reqReason } = TabLogic.meetsRequirements(
              actor as unknown as Actor,
              reqs,
            );

            if (!eligible) {
              ui.notifications?.warn(
                `Could not start follow-up project: Requirements not met for ${escapedFollowUpName}: ${reqReason}`,
              );
            } else {
              const newItem = await this.initiateProjectFromItem(
                actor as unknown as Actor,
                followUpItem,
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
                  `Started follow-up project: ${followUpItem.name} with ${
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
      const freshItem = (actor as unknown as Actor).items.get(item.id) as Item5e & {
        displayCard?: (options?: object) => Promise<unknown>;
      };
      if (freshItem && typeof freshItem.displayCard === "function") {
        await freshItem.displayCard({ rollMode: rules.rollMode });
      }
    }

    const BATCH_THRESHOLD = 5;
    if (isSeparate && tu.ratio > BATCH_THRESHOLD) {
      const successCount = rolls.filter((r) => r.total >= (rules.checkDC || 0)).length;
      ui.notifications?.info(
        `Training complete: Gained ${totalProgressGained} progress from ${tu.ratio} separate rolls (${successCount} successes).`,
      );
    } else {
      for (const r of rolls) {
        await r.toMessage(
          {
            flavor: `${actor.name} tries to learn ${item.name} (DC ${rules.checkDC})`,
          },
          { rollMode: rules.rollMode || "gmroll" },
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
      await this.processSpendAll(project as unknown as Item5e, autoSpendUnits);
    } else if (autoSpendEnabled && projects.length > 1) {
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
}
