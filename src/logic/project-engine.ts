import { DEFAULT_DC } from "../global.js";
import { Settings } from "../core/settings.js";
import { ActorProxy } from "./actor-proxy.js";
import { ActivityManager } from "../core/activity-manager.js";
import { ProjectLifecycle } from "./project-lifecycle.js";
import { LearningActivityData, ProjectFlagData, ProjectItem } from "./project-item.js";
import { isActor5e } from "../types.js";
import type {
  Item5e,
  Actor5e,
  LearningActor,
  TimeUnit,
  SystemRules,
  TrainingRoll,
} from "../types.js";
import { Socket } from "../core/socket.js";

import { ProjectUI } from "../core/project-ui.js";

export class ProjectEngine {
  static readonly BATCH_THRESHOLD = 12;

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
    return await ProjectLifecycle.initiateProjectFromItem(actor, rewardDoc, tutelageId);
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
    if (!actor || !isActor5e(actor)) return false;

    const proxy = ActorProxy.forActor(actor);
    const bank = proxy.bank;
    if (!bank.total || bank.total <= 0) {
      if (!allowedUnitIds) {
        ui.notifications?.warn("No training time in your bank!");
      } else {
        console.debug("Downtime Engine | No training time in bank, skipping auto-spend.");
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
        console.warn(
          `Downtime Engine | Failed to process training for "${fitting.name}" unit in Spend All loop. Skipping...`,
        );
        consecutiveFailures++;
        if (consecutiveFailures >= maxConsecutiveFailures) {
          const msg = `Spend All loop aborted after ${consecutiveFailures} consecutive failures.`;
          console.error(`Downtime Engine | ${msg}`);
          ui.notifications?.error(`Downtime Engine | ${msg}`);
          break;
        }
        iterations++;
        continue;
      }

      // Defensive check: ensure bank actually decreased
      const newBank = proxy.bank.total || 0;
      if (newBank >= currentBank) {
        const msg = `Spend All loop detected no decrease in bank total after successful training for "${fitting.name}". Aborting to prevent infinite loop.`;
        console.error(`Downtime Engine | ${msg}`);
        ui.notifications?.error(`Downtime Engine | ${msg}`);
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
      console.warn(`Downtime Engine | ${msg}`);
      ui.notifications?.warn(`Downtime Engine | ${msg}`);
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
    if (!actor || !isActor5e(actor)) return false;

    // Handle "Spend all" activity
    if (learningActivity.flags?.[Settings.ID]?.isSpendAll) {
      return await this.processSpendAll(item as Item5e);
    }

    const projectDataFlags = item.getFlag("thefehrs-learning-manager", "projectData");
    if (!projectDataFlags || !projectDataFlags.target || projectDataFlags.target <= 0) {
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

    const guidanceTiers = Settings.get("guidanceTiers");
    const tier = guidanceTiers.find((t) => t.id === projectDataFlags.tutelageId);
    if (!tier) {
      ui.notifications?.warn("Please select a tutelage tier for this project.");
      return false;
    }

    // If it's a bulk unit, ensure the tier actually provides progress for it
    if (tu.isBulk && Settings.get("rules").bulkMethod === "direct") {
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

    const { TabLogic } = await this.importTabLogic();

    const rules = Settings.get("rules");
    let isSeparate = false;

    if (!options.skipPrompt && tu.isBulk && rules.nonBulkMethod === "roll") {
      const bulkResult = await TabLogic.computeProgress(actor, rules, tier, tu, {
        preview: true,
      });
      const prob = await TabLogic.calculateSuccessProbability(actor, rules, tier);
      const expectedPerRoll = await TabLogic.calculateExpectedProgress(actor, rules, tier);
      const chancePercent = Math.round(prob * 100);
      const expectedFromSeparate = isNaN(expectedPerRoll)
        ? "unavailable"
        : (tu.ratio * expectedPerRoll).toFixed(1);

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
          {
            action: "separate",
            label: tu.ratio > 5 ? `Roll separately (${tu.ratio} rolls!)` : `Roll separately`,
            icon: "fas fa-dice-d20",
          },
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
    let rolls: TrainingRoll[] = [];
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
      await this.completeProject(item as Item5e);

      if (excessProgress > 0 && projectDataFlags.followUpProjectId) {
        const doc = await fromUuid(projectDataFlags.followUpProjectId as `Item.${string}`);
        const followUpItem = doc instanceof Item ? doc : null;
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
              const newItem = await this.initiateProjectFromItem(
                actor,
                followUpItem,
                projectDataFlags.tutelageId,
              );
              if (newItem) {
                const newFlags = (newItem as unknown as ProjectItem).getFlag(
                  "thefehrs-learning-manager",
                  "projectData",
                );
                if (newFlags) {
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
      }
    } else {
      await this.updateItemWithProgress(item as Item5e, projectDataFlags);

      // Ensure we have the latest document instance before displaying the card
      const freshItem = actor.items.get(item.id) as Item5e | undefined;
      if (freshItem && typeof freshItem.displayCard === "function") {
        await freshItem.displayCard({ rollMode: rules.rollMode });
      }
    }

    if (isSeparate && tu.ratio > ProjectEngine.BATCH_THRESHOLD) {
      const successCount = rolls.filter(
        (r) => r.total >= Number(rules.checkDC ?? DEFAULT_DC),
      ).length;
      ui.notifications?.info(
        `Training complete: Gained ${totalProgressGained} progress from ${tu.ratio} separate rolls (${successCount} successes).`,
      );
    } else {
      for (const r of rolls) {
        await r.toMessage(
          {
            flavor: `${actor.name} tries to learn ${item.name} (DC ${Number(rules.checkDC ?? DEFAULT_DC)})`,
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
    } else if (isSeparate && tu.ratio <= ProjectEngine.BATCH_THRESHOLD) {
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
      await this.processSpendAll(project as Item5e, autoSpendUnits);
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
            <i class="fas fa-dice-d20"></i> <b>Separate Rolls</b>: Each hour has a <strong>${chancePercent}%</strong> chance of success (DC ${Number(rules.checkDC ?? DEFAULT_DC)}).
            <br><small style="opacity: 0.8;">Statistically expected progress: ${expectedFromSeparate} across ${tu.ratio} rolls.</small>
            ${
              tu.ratio > 5
                ? `<br><small style="color: #8a6d3b;"><i class="fas fa-exclamation-triangle"></i> Note: This will trigger ${
                    tu.ratio
                  } separate ${
                    tu.ratio > ProjectEngine.BATCH_THRESHOLD
                      ? "rolls (summarized in one message)"
                      : "roll messages"
                  }.</small>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  }
}
