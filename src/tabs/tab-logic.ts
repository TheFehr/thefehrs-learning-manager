import { Settings } from "../settings";
import { ActorProxy } from "../actor-proxy";
import type {
  ProjectTemplate,
  DowntimeActor,
  TimeUnit,
  ProjectRequirement,
  ComparisonOperator,
} from "../types";

export class TabLogic {
  static editModeState = new Map<string, boolean>();

  static activateListeners(html: HTMLElement, actor: Actor) {
    // Bulk Training Listener
    html.querySelectorAll(".bulk-train").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        const target = ev.currentTarget as HTMLElement | null;
        if (!target || !target.dataset) return;

        const { id, unit } = target.dataset;
        if (!id || !unit) return;

        await this.processTraining(actor as DowntimeActor, id, unit);
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
          const { eligible, reason } = this.meetsRequirements(actor, tpl.requirements || []);
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

    // Toggle Progress Edit Listener
    const toggleBtn = html.querySelector(".toggle-progress-edit");
    const isEditMode = this.editModeState.get(actor.id) || false;

    const updateDisplay = (editMode: boolean) => {
      if (toggleBtn) {
        if (editMode) {
          toggleBtn.setAttribute("aria-checked", "true");
          toggleBtn.innerHTML = '<i class="thumb-icon fas fa-unlock fa-fw"></i><!---->';
        } else {
          toggleBtn.setAttribute("aria-checked", "false");
          toggleBtn.innerHTML = '<i class="thumb-icon fas fa-lock fa-fw"></i><!---->';
        }
      }
      html.querySelectorAll(".progress-read-only").forEach((el) => {
        (el as HTMLElement).style.display = editMode ? "none" : "inline";
      });
      html.querySelectorAll(".update-project-progress").forEach((el) => {
        (el as HTMLElement).style.display = editMode ? "inline" : "none";
      });
    };

    updateDisplay(isEditMode);

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const currentState = this.editModeState.get(actor.id) || false;
        const newState = !currentState;
        this.editModeState.set(actor.id, newState);
        updateDisplay(newState);
      });
    }

    // Manual Progress Update (GM only)
    html.querySelectorAll(".update-project-progress").forEach((input) => {
      input.addEventListener("change", async (ev) => {
        if (!game.user?.isGM) return;
        const target = ev.currentTarget as HTMLInputElement | null;
        if (!target || !target.dataset) return;

        const { actorId, projectId } = target.dataset;
        const newProgress = Math.max(0, parseInt(target.value, 10) || 0);
        const targetActor = game.actors?.get(actorId as string) as Actor | undefined;
        if (!targetActor) return;

        const proxy = ActorProxy.forActor(targetActor);
        const projects = proxy.projects;
        const p = projects.find((x) => x.id === projectId);

        if (p) {
          const tpl = Settings.projectTemplates.find((t) => t.id === p.templateId);
          if (!tpl) return;

          p.progress = Math.max(0, Math.min(newProgress, tpl.target));
          if (p.progress >= tpl.target && !p.isCompleted) {
            p.isCompleted = true;
            await this.grantProjectReward(targetActor as Actor, tpl);
          }
          await proxy.setProjects(projects);
        }
      });
    });
  }

  static async computeProgress(
    actor: DowntimeActor,
    rules: any,
    tier: any,
    tu: any,
  ): Promise<{ progressGained: number; roll?: any }> {
    let progressGained = 0;
    let roll: any = undefined;

    if (tu.isBulk) {
      progressGained = tier.progress?.[tu.id] || 0;
    } else if (rules.method === "roll") {
      roll = await new Roll(rules.checkFormula, {
        ...actor.getRollData(),
        tutelage: tier.modifier,
      }).evaluate();

      let multiplier = 1;
      const strategy = rules.critDoubleStrategy ?? "never"; // legacy was "any" with threshold 20, but we'll default to never if missing, or maybe "any" since default was any?
      const threshold = rules.critThreshold ?? 20;

      if (strategy !== "never") {
        const d20s = (roll.dice ?? []).filter((die: any) => die.faces === 20);
        if (d20s.length > 0) {
          if (strategy === "any") {
            if (d20s.some((die: any) => die.results?.[0]?.result >= threshold)) multiplier = 2;
          } else if (strategy === "all") {
            if (d20s.every((die: any) => die.results?.[0]?.result >= threshold)) multiplier = 2;
          }
        }
      }

      if (roll.total >= rules.checkDC) progressGained = 1 * multiplier;
    } else {
      progressGained = 1;
    }
    return { progressGained, roll };
  }

  static async addCurrency(actor: Actor, amountCp: number) {
    const proxy = ActorProxy.forActor(actor);
    const cur = proxy.currency;
    let totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    totalCp += amountCp;
    const newGp = Math.floor(totalCp / 100);
    totalCp %= 100;
    const newSp = Math.floor(totalCp / 10);
    const newCp = totalCp % 10;

    await proxy.updateCurrency({ gp: newGp, sp: newSp, cp: newCp });
  }

  static async processTraining(actor: DowntimeActor, projectId: string, unitId: string) {
    const rules = Settings.rules;
    const library = Settings.guidanceTiers;
    const timeUnits = Settings.timeUnits;

    const proxy = ActorProxy.forActor(actor);
    const bank = proxy.bank;
    const originalProjects = proxy.projects;
    const projects = foundry.utils.deepClone(originalProjects);
    const p = projects.find((x: any) => x.id === projectId);
    const tu = timeUnits.find((x: any) => x.id === unitId);

    if (!p || !tu || bank.total < tu.ratio) return ui.notifications?.warn(`Not enough time!`);

    const tpl = Settings.projectTemplates.find((t) => t.id === p.templateId);
    if (!tpl) return ui.notifications?.warn("Project template missing!");

    const tier = library.find((t) => t.id === p.guidanceTierId) || {
      id: "unknown",
      name: "Unknown",
      modifier: 0,
      costs: {},
      progress: {},
    };
    const costCp = tier.costs?.[tu.id] || 0;

    const cur = proxy.currency;
    const totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (totalCp < costCp) return ui.notifications?.warn(`Need ${costCp}cp!`);

    const { progressGained, roll } = await this.computeProgress(actor, rules, tier, tu);

    let completedNow = false;
    p.progress = Math.min(p.progress + progressGained, tpl.target);
    if (p.progress >= tpl.target && !p.isCompleted) {
      p.isCompleted = true;
      completedNow = true;
    }

    const rollbacks: (() => Promise<void>)[] = [];

    try {
      if (costCp > 0) {
        const didDeduct = await this.deductCurrency(actor, costCp);
        if (!didDeduct) throw new Error("Currency deduction failed");
        rollbacks.push(async () => {
          await this.addCurrency(actor, costCp);
        });
      }

      await proxy.setBank({ total: bank.total - tu.ratio });
      rollbacks.push(async () => {
        await proxy.setBank(bank);
      });

      await proxy.setProjects(projects);
      rollbacks.push(async () => {
        await proxy.setProjects(originalProjects);
      });

      if (completedNow) {
        const rewardDocs = await this.grantProjectReward(actor, tpl);
        if (rewardDocs && rewardDocs.length > 0) {
          rollbacks.push(async () => {
            const ids = rewardDocs.map((d: any) => d.id || d._id).filter(Boolean);
            if (ids.length > 0) {
              const rewardType = tpl.rewardType === "effect" ? "ActiveEffect" : "Item";
              await proxy.deleteEmbeddedDocuments(rewardType, ids);
            }
          });
        }
      }
    } catch (e) {
      console.error("Training transaction failed, rolling back", e);
      ui.notifications?.error("Training failed, reverting changes.");
      for (const rollback of rollbacks.reverse()) {
        try {
          await rollback();
        } catch (rbError) {
          console.error("Rollback failed!", rbError);
        }
      }
      return;
    }

    if (roll) {
      await roll.toMessage({ flavor: `Learning Check: ${tpl.name}` });
    }

    if (progressGained === 0) {
      ui.notifications?.info("Training unsuccessful - no progress gained.");
    }
  }

  static async grantProjectReward(actor: Actor, template: ProjectTemplate): Promise<any[]> {
    if (!template.rewardUuid) return [];
    try {
      const rewardDoc = await fromUuid(template.rewardUuid as any);
      if (!rewardDoc) throw new Error(`Reward doc ${template.rewardUuid} not found`);
      const proxy = ActorProxy.forActor(actor);
      const rewardType = template.rewardType === "effect" ? "effect" : "item";
      let created: any[] = [];
      if (rewardType === "item" && rewardDoc instanceof Item) {
        created = await proxy.createEmbeddedDocuments("Item", [rewardDoc.toObject()]);
        ui.notifications?.info(`Learning Complete: ${proxy.name} gained item ${rewardDoc.name}!`);
      } else if (rewardType === "effect" && rewardDoc instanceof ActiveEffect) {
        const effectData = rewardDoc.toObject() as any;
        effectData.origin = proxy.uuid;
        created = await proxy.createEmbeddedDocuments("ActiveEffect", [effectData]);
        ui.notifications?.info(`Learning Complete: ${proxy.name} gained effect ${rewardDoc.name}!`);
      } else {
        throw new Error("Invalid reward type or missing required document class");
      }
      return created;
    } catch (e) {
      console.error(e);
      ui.notifications?.error("Failed to grant project reward");
      throw e;
    }
  }

  static async deductCurrency(actor: Actor, amountCp: number): Promise<boolean> {
    if (amountCp < 0) {
      console.warn("Negative amount deducted");
      return false;
    }
    const proxy = ActorProxy.forActor(actor);
    const cur = proxy.currency;
    let totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (totalCp < amountCp) {
      ui.notifications?.warn("Insufficient funds!");
      return false;
    }

    totalCp -= amountCp;
    const newGp = Math.floor(totalCp / 100);
    totalCp %= 100;
    const newSp = Math.floor(totalCp / 10);
    const newCp = totalCp % 10;

    await proxy.updateCurrency({ gp: newGp, sp: newSp, cp: newCp });
    return true;
  }

  static meetsRequirements(
    actor: Actor,
    requirements: ProjectRequirement[],
  ): { eligible: boolean; reason: string } {
    for (const req of requirements) {
      const actorValue = foundry.utils.getProperty(actor, req.attribute);
      const targetValue = req.value;
      const op: ComparisonOperator = req.operator;

      let met = false;
      switch (op) {
        case "===":
          met = String(actorValue) === String(targetValue);
          break;
        case "!==":
          met = String(actorValue) !== String(targetValue);
          break;
        case ">":
          met = Number(actorValue) > Number(targetValue);
          break;
        case ">=":
          met = Number(actorValue) >= Number(targetValue);
          break;
        case "<":
          met = Number(actorValue) < Number(targetValue);
          break;
        case "<=":
          met = Number(actorValue) <= Number(targetValue);
          break;
        case "includes":
          if (Array.isArray(actorValue)) {
            met = actorValue.includes(targetValue);
          } else if (typeof actorValue === "string") {
            met = actorValue.includes(String(targetValue));
          } else {
            met = false;
          }
          break;
      }
      if (!met) return { eligible: false, reason: `${req.attribute} ${op} ${req.value}` };
    }
    return { eligible: true, reason: "" };
  }

  static formatTimeBank(totalUnits: number, timeUnits: TimeUnit[]): string {
    const sorted = [...timeUnits].sort((a, b) => b.ratio - a.ratio);
    const parts: string[] = [];
    let remaining = totalUnits;

    for (const unit of sorted) {
      const count = Math.floor(remaining / unit.ratio);
      if (count > 0) {
        parts.push(`${count}${unit.short}`);
        remaining %= unit.ratio;
      }
    }

    return parts.length > 0 ? parts.join(" ") : "0";
  }
}
