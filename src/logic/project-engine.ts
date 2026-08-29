import { DEFAULT_DC } from "@/global.js";
import { Settings } from "@/core/settings.js";
import { Logger } from "@/core/logger.js";
import { FoundryUtils } from "@/core/foundry-utils.js";
import { ActorProxy } from "./actor-proxy.js";
import { ActivityManager } from "@/core/activity-manager.js";
import { ProjectLifecycle } from "./project-lifecycle.js";
import { LearningActivityData, ProjectFlagData, ProjectItem } from "./project-item.js";
import { isActor5e } from "@/types.js";
import type { Item5e, TrainingRoll, Actor5e } from "@/types.js";
import { Socket } from "@/core/socket.js";
import { mount, unmount } from "svelte";
import { TutelageResolverService } from "./tutelage-resolver.js";
import InstructorSelectionDialog from "@/apps/dialogs/InstructorSelectionDialog.svelte";
import TrainingResolutionDialog from "@/apps/dialogs/TrainingResolutionDialog.svelte";
import { TabLogic } from "./tab-logic.js";

import { getGame, getUI } from "@/core/foundry.js";

export interface InstructorDialogResult {
  instructor: {
    actorUuid: string;
    offering: {
      name: string;
    };
  } | null;
  remember: boolean;
}

export interface TrainingSessionState {
  projectData: ProjectFlagData;
  bankTotal: number;
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
}

export interface TrainingSessionResult {
  progressGained: number;
  excessProgress: number;
  costCp: number;
  timeSpent: number;
  rolls: TrainingRoll[];
  reasons: string[];
  instructorName: string;
  newState: TrainingSessionState;
}

export class ProjectEngine {
  static readonly BATCH_THRESHOLD = 12;

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
    return await ProjectLifecycle.initiateProjectFromItem(actor, rewardDoc);
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
    instructorName: string = "Self-Study",
    render: boolean = false,
  ): Promise<void> {
    return ProjectLifecycle.updateItemWithProgress(item, projectData, instructorName, render);
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
        getUI()?.notifications?.warn("No valid training activities found for this project.");
      return false;
    }

    // If manual (no allowedUnitIds), ask for confirmation
    if (!allowedUnitIds) {
      const formattedTime = TabLogic.formatTimeBank(bank.total || 0, Settings.get("timeUnits"));
      const safeFormattedTime = FoundryUtils.escapeHTML(formattedTime);
      const safeItemName = FoundryUtils.escapeHTML(item.name || "Unknown");

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

    // Initialize local state for aggregation
    let currentState: TrainingSessionState = {
      projectData: FoundryUtils.deepClone(
        (item.getFlag(Settings.ID, "projectData") as ProjectFlagData) || {},
      ),
      bankTotal: bank.total,
      currency: FoundryUtils.deepClone(proxy.currency),
    };

    const aggregatedResult: TrainingSessionResult = {
      progressGained: 0,
      excessProgress: 0,
      costCp: 0,
      timeSpent: 0,
      rolls: [],
      reasons: [],
      instructorName: "Self-Study",
      newState: currentState,
    };

    while (iterations < maxIterations) {
      const currentBank = currentState.bankTotal;
      const fitting = activities.find((a) => a.ratio <= currentBank);

      if (!fitting) break;

      const result = await this.executeTrainingIteration(fitting.activity, {
        skipPrompt: true,
        currentState,
      });

      if (!result) {
        Logger.warn(
          `Failed to process training for "${fitting.name}" unit in Spend All loop. Skipping...`,
        );
        break; // Stop on first failure in Spend All
      }

      // Update local aggregation
      aggregatedResult.progressGained += result.progressGained;
      aggregatedResult.excessProgress = result.excessProgress;
      aggregatedResult.costCp += result.costCp;
      aggregatedResult.timeSpent += result.timeSpent;
      aggregatedResult.rolls.push(...result.rolls);
      aggregatedResult.reasons.push(...result.reasons);
      aggregatedResult.instructorName = result.instructorName;
      currentState = result.newState;
      aggregatedResult.newState = currentState;

      anySuccess = true;

      if (currentState.projectData.isCompleted) break;

      iterations++;
    }

    if (iterations >= maxIterations) {
      const msg = `processSpendAll reached maximum iterations (${maxIterations}) for project "${item.name || "Unknown"}". Possible infinite loop logic or extremely large bank.`;
      Logger.warn(msg);
    }

    if (anySuccess) {
      await this.applyTrainingResult(actor, item as unknown as Item5e, aggregatedResult);
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
      return await this.processSpendAll(item as unknown as Item5e);
    }

    const result = await this.executeTrainingIteration(learningActivity, options);
    if (!result) return false;

    return await this.applyTrainingResult(actor, item as unknown as Item5e, result);
  }

  /**
   * Performs the logic for one training iteration (calculation only, no database side effects).
   */
  static async executeTrainingIteration(
    learningActivity: LearningActivityData,
    options: { skipPrompt?: boolean; currentState?: TrainingSessionState } = {},
  ): Promise<TrainingSessionResult | null> {
    const item = learningActivity.item;
    const actor = item.actor;
    if (!actor || !isActor5e(actor)) return null;

    const projectDataFlags =
      options.currentState?.projectData ??
      FoundryUtils.deepClone((item.getFlag(Settings.ID, "projectData") as ProjectFlagData) || {});

    if (!projectDataFlags || !projectDataFlags.target || projectDataFlags.target <= 0) {
      if (!options.currentState)
        getUI()?.notifications?.warn("This project is awaiting a GM-defined target progress.");
      return null;
    }

    const flags = learningActivity.flags[Settings.ID];
    const timeUnitId = flags?.timeUnitId;
    const timeUnits = Settings.get("timeUnits");
    const tu = timeUnits.find((u) => u.id === timeUnitId);
    if (!tu) return null;

    const bankTotal = options.currentState?.bankTotal ?? ActorProxy.forActor(actor).bank.total ?? 0;
    if (bankTotal < tu.ratio) {
      if (!options.currentState) getUI()?.notifications?.warn(`Not enough time!`);
      return null;
    }

    const instructors = await TutelageResolverService.getAvailableInstructors(item as ProjectItem);
    const books = TutelageResolverService.getAvailableBooks(actor, item as ProjectItem);
    const bestBookMod = books.reduce((max, b) => Math.max(max, b.modifier), 0);
    const bestBookNames = books
      .filter((b) => b.modifier === bestBookMod && bestBookMod > 0)
      .map((b) => b.name)
      .join(", ");

    let selectedInstructor = null;
    let rememberChoice = false;

    if (instructors.length > 0 || bestBookMod > 0) {
      const rememberedId = projectDataFlags.rememberedInstructorUuid;
      const rememberedName = projectDataFlags.rememberedInstructorName;

      const remembered = instructors.find(
        (i) => i.actorUuid === rememberedId && i.offering.name === rememberedName,
      );

      const lastId = projectDataFlags.lastInstructorUuid;
      const lastName = projectDataFlags.lastInstructorName;

      if (options.skipPrompt && remembered) {
        selectedInstructor = remembered;
      } else if (!options.skipPrompt) {
        let dialogInstance: any;
        const choice = await new Promise<InstructorDialogResult | "cancel" | null>((resolve) => {
          const cleanup = (shouldCloseDialog = false) => {
            if (dialogInstance) {
              unmount(dialogInstance);
              dialogInstance = null;
            }
            if (shouldCloseDialog === true) dialog.close();
            resolve(null);
          };

          const DialogV2 = (foundry.applications.api as unknown as { DialogV2: any }).DialogV2;
          const dialog = new DialogV2({
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
            close: () => cleanup(),
            modal: true,
            rejectClose: false,
          });

          dialog
            .render({ force: true })
            .then(() => {
              const root = dialog.element.querySelector(".ude-instructor-dialog-root");
              if (root) {
                dialogInstance = mount(InstructorSelectionDialog, {
                  target: root,
                  props: {
                    instructors,
                    bestBookMod,
                    bestBookNames,
                    timeUnit: tu,
                    lastInstructorUuid: lastId,
                    lastInstructorName: lastName,
                  },
                });
              } else {
                cleanup(true);
              }
            })
            .catch((err: any) => {
              Logger.error(
                "ProjectEngine | Error rendering instructor selection dialog:",
                true,
                err,
              );
              resolve(null);
              cleanup(true);
            });
        });

        if (!choice || choice === "cancel") return null;
        selectedInstructor = choice.instructor;
        rememberChoice = choice.remember;
      }
    }

    const resolution = await TutelageResolverService.resolveTutelage(
      actor,
      item as ProjectItem,
      selectedInstructor?.actorUuid,
      selectedInstructor?.offering.name,
    );
    const tutelageMod = resolution.modifier;
    const costCp = resolution.costs[tu.id] || 0;

    const cur = options.currentState?.currency ?? ActorProxy.forActor(actor).currency;
    const totalCp = cur.pp * 1000 + cur.gp * 100 + cur.ep * 50 + cur.sp * 10 + cur.cp;

    if (totalCp < costCp) {
      if (!options.currentState) getUI()?.notifications?.warn(`Need ${costCp}cp!`);
      return null;
    }

    projectDataFlags.lastInstructorUuid = selectedInstructor?.actorUuid ?? "";
    projectDataFlags.lastInstructorName = resolution.instructorName ?? "Self-Study";

    if (rememberChoice) {
      projectDataFlags.rememberedInstructorUuid = selectedInstructor?.actorUuid;
      projectDataFlags.rememberedInstructorName = selectedInstructor?.offering.name;
    }

    const rules = Settings.get("rules");
    let isSeparate = false;

    if (
      !options.skipPrompt &&
      tu.isBulk &&
      (rules.nonBulkMethod === "roll" || rules.bulkMethod === "roll")
    ) {
      const isBulkRoll = rules.bulkMethod === "roll";
      const isSeparateRoll = rules.nonBulkMethod === "roll";

      const prob = await TabLogic.calculateSuccessProbability(actor, rules, tutelageMod);
      const chancePercent = prob === null ? "unavailable" : Math.round(prob * 100);
      const expectedPerRoll = await TabLogic.calculateExpectedProgress(actor, rules, tutelageMod);

      let bulkValue: string | number;
      if (isBulkRoll) {
        bulkValue = isNaN(expectedPerRoll) ? "unavailable" : expectedPerRoll.toFixed(1);
      } else {
        const bulkRes = await TabLogic.computeProgress(actor, rules, tutelageMod, tu);
        bulkValue = bulkRes.progressGained;
      }

      let separateValue: string | number;
      if (isSeparateRoll) {
        separateValue = isNaN(expectedPerRoll)
          ? "unavailable"
          : (expectedPerRoll * tu.ratio).toFixed(1);
      } else {
        const sepRes = await TabLogic.computeProgress(actor, rules, tutelageMod, {
          ...tu,
          isBulk: false,
          ratio: 1,
        });
        separateValue = (sepRes.progressGained * tu.ratio).toFixed(1);
      }

      const choice = await new Promise<"bulk" | "separate" | null>((resolve) => {
        let resolutionInstance: any;

        const cleanup = () => {
          if (resolutionInstance) {
            unmount(resolutionInstance);
            resolutionInstance = null;
          }
          resolve(null);
        };

        const DialogV2 = (foundry.applications.api as unknown as { DialogV2: any }).DialogV2;
        const dialog = new DialogV2({
          window: { title: `Training Resolution: ${tu.name}` },
          content: '<div class="ude-resolution-dialog-root"></div>',
          buttons: [
            {
              action: "bulk",
              label: "Use Bulk",
              icon: "fas fa-calculator",
              callback: () => resolve("bulk"),
            },
            {
              action: "separate",
              label: isSeparateRoll
                ? tu.ratio > 5
                  ? `Roll separately (${tu.ratio} rolls!)`
                  : `Roll separately`
                : `Process separately`,
              icon: isSeparateRoll ? "fas fa-dice-d20" : "fas fa-list-ol",
              callback: () => resolve("separate"),
            },
          ],
          close: () => cleanup(),
          rejectClose: false,
          modal: true,
        });

        dialog
          .render({ force: true })
          .then(() => {
            const root = dialog.element.querySelector(".ude-resolution-dialog-root");
            if (root) {
              resolutionInstance = mount(TrainingResolutionDialog, {
                target: root,
                props: {
                  tuName: tu.name,
                  bulkValue,
                  chancePercent,
                  separateValue,
                  checkDC: Number(rules.checkDC ?? DEFAULT_DC),
                  isBulkRoll,
                  isSeparateRoll,
                  batchThreshold: ProjectEngine.BATCH_THRESHOLD,
                  ratio: tu.ratio,
                },
              });
            } else {
              cleanup();
              dialog.close();
            }
          })
          .catch((err: any) => {
            Logger.error("ProjectEngine | Error rendering training resolution dialog:", true, err);
            cleanup();
          });
      });

      if (!choice) return null;

      if (choice === "bulk" && bulkValue === "unavailable") {
        getUI()?.notifications?.warn(`The chosen bulk training path is unavailable.`);
        return null;
      }
      if (choice === "separate" && separateValue === "unavailable") {
        getUI()?.notifications?.warn(`The chosen separate training path is unavailable.`);
        return null;
      }

      isSeparate = choice === "separate";
    }

    let totalProgressGained = 0;
    let rolls: TrainingRoll[] = [];
    let reasons: string[] = [];

    const iterations = isSeparate ? tu.ratio : 1;
    const baseTu = isSeparate ? { ...tu, isBulk: false, ratio: 1 } : tu;

    for (let i = 0; i < iterations; i++) {
      const res = await TabLogic.computeProgress(actor, rules, tutelageMod, baseTu);
      totalProgressGained += res.progressGained;
      if (res.roll) rolls.push(res.roll);
      if (res.reason) reasons.push(res.reason);
    }

    const priorProgress = projectDataFlags.progress || 0;
    const rawProgress = priorProgress + totalProgressGained;
    const target = projectDataFlags.target || 0;
    projectDataFlags.progress = Math.min(rawProgress, target);
    const excessProgress = Math.max(0, rawProgress - target);

    if (projectDataFlags.progress >= target && !projectDataFlags.isCompleted) {
      projectDataFlags.isCompleted = true;
    }

    // New state calculation
    const newBankTotal = bankTotal - tu.ratio;
    let newCurrency = FoundryUtils.deepClone(cur);

    if (costCp > 0) {
      newCurrency = TabLogic.calculateNewCurrency(cur, costCp);
    }

    return {
      progressGained: totalProgressGained,
      excessProgress,
      costCp,
      timeSpent: tu.ratio,
      rolls,
      reasons,
      instructorName: resolution.instructorName ?? "Self-Study",
      newState: {
        projectData: projectDataFlags,
        bankTotal: newBankTotal,
        currency: newCurrency,
      },
    };
  }

  /**
   * Commits aggregated training results to the database.
   */
  static async applyTrainingResult(
    actor: Actor5e,
    item: Item5e,
    result: TrainingSessionResult,
  ): Promise<boolean> {
    const proxy = ActorProxy.forActor(actor);
    const {
      newState,
      instructorName,
      rolls,
      reasons,
      progressGained,
      excessProgress,
      timeSpent,
      costCp,
    } = result;

    try {
      // Currency update
      if (costCp > 0) {
        await proxy.updateCurrency(newState.currency);
      }

      // Bank update
      await proxy.setBank({ total: newState.bankTotal });

      if (newState.projectData.isCompleted) {
        await this.updateItemWithProgress(item, newState.projectData, instructorName, true);
        await this.completeProject(item);

        if (excessProgress > 0 && newState.projectData.followUpProjectId) {
          await this._handleFollowUp(
            actor,
            item,
            excessProgress,
            newState.projectData.followUpProjectId,
          );
        }
      } else {
        await this.updateItemWithProgress(item, newState.projectData, instructorName, true);
        const freshItem = actor.items.get(item.id!) as Item5e | undefined;
        if (freshItem?.displayCard) {
          await freshItem.displayCard({ rollMode: Settings.get("rules").rollMode });
        }
      }
    } catch (err) {
      Logger.error("Failed to apply training results:", true, err);
      getUI()?.notifications?.error(`Failed to update project "${item.name}".`);
      return false;
    }

    // Chat messages and notifications
    const rules = Settings.get("rules");
    if (rolls.length > ProjectEngine.BATCH_THRESHOLD) {
      const successCount = rolls.filter(
        (r) => (r.total || 0) >= Number(rules.checkDC ?? DEFAULT_DC),
      ).length;
      getUI()?.notifications?.info(
        `Training complete: Gained ${progressGained} progress from ${timeSpent} hours (${successCount} successes).`,
      );
    } else {
      for (const r of rolls) {
        await r.toMessage(
          {
            speaker: ChatMessage.getSpeaker({ actor: actor as Actor.Stored }),
            flavor: `${actor.name} tries to learn ${item.name || "Unknown Item"} (DC ${Number(rules.checkDC ?? DEFAULT_DC)})`,
          },
          { rollMode: (rules.rollMode || "gmroll") as foundry.dice.RollMode },
        );
      }
    }

    if (progressGained === 0) {
      const msg =
        reasons.length > 0 ? `Training unsuccessful: ${reasons[0]}` : "Training unsuccessful.";
      getUI()?.notifications?.info(msg);
    } else if (rolls.length <= ProjectEngine.BATCH_THRESHOLD) {
      getUI()?.notifications?.info(`Training complete: Gained ${progressGained} progress.`);
    }

    return true;
  }

  private static async _handleFollowUp(
    actor: Actor5e,
    item: Item5e,
    excess: number,
    followUpId: string,
  ) {
    const followUpItem = (await fromUuid(followUpId as `Item.${string}`)) as unknown as Item | null;
    if (!followUpItem) return;

    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Learning Progress Exceeded" },
      content: `<p>You generated <strong>${excess}</strong> more progress than needed to complete <strong>${FoundryUtils.escapeHTML(item.name || "")}</strong>.</p>
                <p>Apply it to <strong>${FoundryUtils.escapeHTML(followUpItem.name || "")}</strong>?</p>`,
      rejectClose: false,
    });

    if (proceed) {
      const newItem = await this.initiateProjectFromItem(actor as unknown as Actor, followUpItem);
      if (newItem) {
        const newFlags = FoundryUtils.deepClone(
          (newItem as unknown as ProjectItem).getFlag(Settings.ID, "projectData"),
        );
        if (newFlags) {
          newFlags.progress = Math.min(excess, newFlags.target || excess);
          await this.updateItemWithProgress(newItem, newFlags);
        }
      }
    }
  }

  /**
   * Executed on every client when the signal is received.
   */
  static async handleAutoTrainSignal() {
    const autoSpendEnabled = Settings.get("autoSpend");
    const autoSpendUnits = Settings.get("autoSpendUnits");

    if (!autoSpendEnabled || getGame().user?.isGM) return;

    const actor = (getGame().user as unknown as { character: Actor }).character;
    if (!actor) return;

    const projects = (actor.items as unknown as Item5e[]).filter((i: Item5e) =>
      i.getFlag(Settings.ID, "isLearningProject"),
    );

    if (projects.length === 1) {
      const project = projects[0];
      await this.processSpendAll(project as Item5e, autoSpendUnits);
    } else if (projects.length > 1) {
      getUI()?.notifications?.warn(
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
