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

        if (p && tier) {
          p.guidanceTierId = tier.id;
          await proxy.setProjects(projects);
        }
      });
    });

    // Toggle Progress Edit Listener
    const toggleBtn = html.querySelector(".toggle-progress-edit");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        html.querySelectorAll(".progress-read-only, .progress-editable").forEach((el) => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.display = htmlEl.style.display === "none" ? "inline" : "none";
        });
      });
    }

    // Manual Progress Update (GM only)
    html.querySelectorAll(".update-project-progress").forEach((input) => {
      input.addEventListener("change", async (ev) => {
        if (!game.user?.isGM) return;
        const target = ev.currentTarget as HTMLInputElement | null;
        if (!target || !target.dataset) return;

        const { actorId, projectId } = target.dataset;
        const newProgress = parseInt(target.value) || 0;
        const targetActor = game.actors?.get(actorId as string) as Actor | undefined;
        if (!targetActor) return;

        const proxy = ActorProxy.forActor(targetActor);
        const projects = proxy.projects;
        const p = projects.find((x) => x.id === projectId);

        if (p) {
          const tpl = Settings.projectTemplates.find((t) => t.id === p.templateId);
          if (!tpl) return;

          p.progress = Math.min(newProgress, tpl.target);
          if (p.progress >= tpl.target && !p.isCompleted) {
            p.isCompleted = true;
            await this.grantProjectReward(targetActor as Actor, tpl);
          }
          await proxy.setProjects(projects);
        }
      });
    });

    // Grant Time Dialog Listener
    const grantBtn = html.querySelector(".grant-time-btn");
    if (grantBtn) {
      grantBtn.addEventListener("click", () => {
        const timeUnits = Settings.timeUnits;
        const unitOptions = timeUnits
          .map((u) => `<option value="${u.id}">${u.name}</option>`)
          .join("");

        new Dialog({
          title: "Grant Time to Party",
          content: `
            <form>
              <div class="form-group">
                <label>Amount</label>
                <input type="number" name="amount" value="1" min="1">
              </div>
              <div class="form-group">
                <label>Unit</label>
                <select name="unit">${unitOptions}</select>
              </div>
            </form>
          `,
          buttons: {
            apply: {
              label: "Grant",
              callback: async (dialogHtml: JQuery) => {
                const amount = parseInt(dialogHtml.find('[name="amount"]').val() as string) || 1;
                const unitId = dialogHtml.find('[name="unit"]').val() as string;
                const tu = timeUnits.find((u) => u.id === unitId);
                if (!tu) return;

                const totalToAdd = amount * tu.ratio;
                const members = (actor as any).system.members || [];
                for (const m of members) {
                  const memberId = m.actorId || m.id;
                  const memberActor = game.actors?.get(memberId) as any;
                  if (memberActor) {
                    try {
                      const proxy = ActorProxy.forActor(memberActor);
                      const bank = proxy.bank;
                      await proxy.setBank({ total: bank.total + totalToAdd });
                    } catch (e) {
                      console.error(`Failed to grant time to ${memberActor.name}:`, e);
                      ui.notifications?.warn(`Failed to grant time to ${memberActor.name}`);
                    }
                  }
                }
              },
            },
          },
          default: "apply",
        }).render(true);
      });
    }
  }

  static async processTraining(actor: DowntimeActor, projectId: string, unitId: string) {
    const rules = Settings.rules;
    const library = Settings.guidanceTiers;
    const timeUnits = Settings.timeUnits;

    const proxy = ActorProxy.forActor(actor);
    const bank = proxy.bank;
    const projects = proxy.projects;
    const p = projects.find((x) => x.id === projectId);
    const tu = timeUnits.find((x) => x.id === unitId);

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
    const costGp = tier.costs?.[tu.id] || 0;
    const costCp = Math.round(costGp * 100);

    const cur = proxy.currency;
    const totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (totalCp < costCp) return ui.notifications?.warn(`Need ${costGp}gp!`);

    const didDeduct = await this.deductCurrency(actor, costGp);
    if (!didDeduct) return;

    let progressGained = 0;
    if (tu.isBulk) {
      progressGained = tier.progress?.[tu.id] || 0;
    } else if (rules.method === "roll") {
      const roll = await new Roll(rules.checkFormula, {
        ...actor.getRollData(),
        tutelage: tier.modifier,
      }).evaluate();

      const firstDie = roll.dice?.[0];
      const isNat20 = firstDie?.results?.[0]?.result === 20;

      if (roll.total >= rules.checkDC || isNat20) progressGained = isNat20 ? 2 : 1;
      await roll.toMessage({ flavor: `Learning Check: ${tpl.name}` });
    } else progressGained = 1;

    if (progressGained === 0) {
      ui.notifications?.info("Training unsuccessful - no progress gained.");
      await proxy.setBank({ total: bank.total - tu.ratio });
    }

    p.progress = Math.min(p.progress + progressGained, tpl.target);

    if (p.progress >= tpl.target && !p.isCompleted) {
      p.isCompleted = true;
      await this.grantProjectReward(actor, tpl);
    }

    await proxy.setBank({ total: bank.total - tu.ratio });
    await proxy.setProjects(projects);
  }

  static async grantProjectReward(actor: Actor, template: ProjectTemplate) {
    if (!template.rewardUuid) return;
    try {
      const rewardDoc = await fromUuid(template.rewardUuid as any);
      if (!rewardDoc) return;
      const proxy = ActorProxy.forActor(actor);
      const rewardType = template.rewardType === "effect" ? "effect" : "item";
      if (rewardType === "item" && rewardDoc instanceof Item) {
        await proxy.createEmbeddedDocuments("Item", [rewardDoc.toObject()]);
        ui.notifications?.info(`Learning Complete: ${proxy.name} gained item ${rewardDoc.name}!`);
      } else if (rewardType === "effect" && rewardDoc instanceof ActiveEffect) {
        const effectData = rewardDoc.toObject() as any;
        effectData.origin = proxy.uuid;
        await proxy.createEmbeddedDocuments("ActiveEffect", [effectData]);
        ui.notifications?.info(`Learning Complete: ${proxy.name} gained effect ${rewardDoc.name}!`);
      }
    } catch (e) {
      console.error(e);
      ui.notifications?.error("Failed to grant project reward");
    }
  }

  static async deductCurrency(actor: Actor, amountGp: number): Promise<boolean> {
    if (amountGp < 0) {
      console.warn("Negative amount deducted");
      return false;
    }
    const proxy = ActorProxy.forActor(actor);
    const cur = proxy.currency;
    let totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;
    const costCp = Math.round(amountGp * 100);

    if (totalCp < costCp) {
      ui.notifications?.warn("Insufficient funds!");
      return false;
    }

    totalCp -= costCp;
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
          met = Array.isArray(actorValue) && actorValue.includes(targetValue);
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
