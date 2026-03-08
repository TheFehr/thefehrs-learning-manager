import type {
  SystemRules,
  GuidanceTier,
  ProjectTemplate,
  LearningProject,
  TimeBank,
  TimeUnit,
  Tidy5eApi,
  Tidy5eTabGetDataParams,
  Tidy5eTabRenderParams,
  DowntimeActor,
  DowntimeGroupActor,
} from "./types";
import { LearningConfigApp } from "./settings-app";
import { Settings } from "./settings";
import "./styles/module.scss";

export class TheFehrsLearningManager {
  static ID = "thefehrs-learning-manager" as const;

  static init() {
    this.registerSettings();
    Handlebars.registerHelper("eq", function (a, b) {
      return a === b;
    });

    Handlebars.registerHelper("array", function (...args) {
      return args.slice(0, -1);
    });

    Settings.registerMenu("configMenu", {
      name: "Downtime Engine Config",
      label: "Open Settings Panel",
      hint: "Configure the Downtime Engine",
      icon: "fas fa-cogs",
      type: LearningConfigApp,
      restricted: true,
    });

    Hooks.on("tidy5e-sheet.ready" as any, (api: Tidy5eApi) => {
      api.registerCharacterTab(
        new api.models.HandlebarsTab({
          title: "Learning",
          iconClass: "fa-solid fa-book-open-cover",
          tabId: "thefehrs-learning-tab",
          path: `modules/${this.ID}/templates/learning-tab.hbs`,
          getData: async (data: Tidy5eTabGetDataParams) => await this.prepareActorData(data.actor),
          onRender: (params: Tidy5eTabRenderParams) => {
            const sheetActor = params.app.document || params.app.actor;
            if (sheetActor) this.activateListeners(params.element, sheetActor);
          },
        }),
      );

      api.registerGroupTab(
        new api.models.HandlebarsTab({
          title: "Group Learning",
          iconClass: "fa-solid fa-book-open-cover",
          tabId: "thefehrs-party-tab",
          path: `modules/${this.ID}/templates/party-tab.hbs`,
          getData: async (data: Tidy5eTabGetDataParams) =>
            await this.preparePartyData(data.actor as DowntimeGroupActor),
          onRender: (params: Tidy5eTabRenderParams) => {
            const sheetActor = params.app.document || params.app.actor;
            if (sheetActor) this.activateListeners(params.element, sheetActor);
          },
        }),
      );
    });
  }

  static registerSettings() {
    Settings.register("rules", {
      scope: "world",
      config: false,
      type: Object,
      default: {
        method: "roll",
        checkDC: 12,
        checkFormula: "1d20 + @tutelage + (2 * @abilities.int.mod)",
      },
    });
    Settings.register("timeUnits", {
      scope: "world",
      config: false,
      type: Array,
      default: [
        { id: "tu_hr", name: "Hour", short: "h", isBulk: false, ratio: 1 },
        { id: "tu_day", name: "Day", short: "d", isBulk: true, ratio: 10 },
        { id: "tu_wk", name: "Week", short: "w", isBulk: true, ratio: 70 },
      ],
    });
    Settings.register("guidanceTiers", {
      scope: "world",
      config: false,
      type: Array,
      default: [
        {
          id: "tier_prof_solo",
          name: "Professional teacher, solo lesson",
          modifier: 10,
          costs: { tu_hr: 5, tu_day: 40, tu_wk: 200 },
          progress: { tu_day: 1, tu_wk: 7 },
        },
        {
          id: "tier_prof_divided",
          name: "Professional teacher, divided attention",
          modifier: 8,
          costs: { tu_hr: 2, tu_day: 15, tu_wk: 75 },
          progress: { tu_day: 1, tu_wk: 7 },
        },
        {
          id: "tier_ama_solo",
          name: "Amateur teacher, solo lesson",
          modifier: 6,
          costs: { tu_hr: 1, tu_day: 8, tu_wk: 40 },
          progress: { tu_day: 1, tu_wk: 7 },
        },
        {
          id: "tier_ama_divided",
          name: "Amateur teacher, divided attention",
          modifier: 4,
          costs: { tu_hr: 0.5, tu_day: 4, tu_wk: 20 },
          progress: { tu_day: 1, tu_wk: 7 },
        },
        {
          id: "tier_self_book",
          name: "Self-taught with a book/untrained help",
          modifier: 2,
          costs: { tu_hr: 0, tu_day: 0, tu_wk: 0 },
          progress: { tu_day: 1, tu_wk: 7 },
        },
        {
          id: "tier_self_none",
          name: "Self-taught, no guidance",
          modifier: 0,
          costs: { tu_hr: 0, tu_day: 0, tu_wk: 0 },
          progress: { tu_day: 1, tu_wk: 7 },
        },
      ],
    });
    Settings.register("projectTemplates", {
      scope: "world",
      config: false,
      type: Array,
      default: [],
    });
  }

  public static formatTimeBank(totalUnits: number, timeUnits: TimeUnit[]): string {
    if (!totalUnits || totalUnits <= 0) return "0";
    const sortedUnits = [...timeUnits].sort((a, b) => b.ratio - a.ratio);
    let remaining = totalUnits;
    let displayParts: string[] = [];
    for (const tu of sortedUnits) {
      const amount = Math.floor(remaining / tu.ratio);
      if (amount > 0) {
        displayParts.push(`${amount}${tu.short}`);
        remaining %= tu.ratio;
      }
    }
    return displayParts.length > 0 ? displayParts.join(" ") : "0";
  }

  private static async prepareActorData(actor: Actor) {
    const timeUnits = Settings.timeUnits;
    const bank = actor.getFlag(this.ID, "bank") || { total: 0 };
    const allProjects = (actor.getFlag(this.ID, "projects") || []).map((p: any) => {
      const tier = Settings.guidanceTiers.find((t) => t.id === p.guidanceTierId);
      return {
        ...p,
        percent: Math.min((p.progress / p.maxProgress) * 100, 100),
        isCompleted: p.progress >= p.maxProgress,
        guidanceType: tier ? tier.name : "None",
      };
    });

    return {
      formattedBank: this.formatTimeBank(bank.total, timeUnits),
      timeUnits,
      activeProjects: allProjects.filter((p) => !p.isCompleted),
      completedProjects: allProjects.filter((p) => p.isCompleted),
      library: Settings.projectTemplates,
      isGM: game.user?.isGM,
    };
  }

  private static async preparePartyData(partyActor: DowntimeGroupActor) {
    const timeUnits = Settings.timeUnits;
    const rawMembers = partyActor.system.members || [];
    const tiers = Settings.guidanceTiers;

    const tierOptions = tiers.reduce((acc: Record<string, string>, t) => {
      const sign = t.modifier > 0 ? "+" : "";
      acc[t.id] = `${t.name} (${sign}${t.modifier})`;
      return acc;
    }, {});

    return {
      members: rawMembers.map((m) => this.mapMemberData(m, timeUnits)).filter((m) => !!m),
      tierOptions,
      isGM: game.user?.isGM,
    };
  }

  private static activateListeners(html: HTMLElement, actor: Actor) {
    // Bulk Training Listener (Updated with dataset validation)
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
          const projects = actor.getFlag(this.ID, "projects") || [];
          projects.push({
            id: foundry.utils.randomID(),
            name: tpl.name,
            progress: 0,
            maxProgress: tpl.target,
            guidanceTierId: "", // Updated to guidanceTierId
            tutelage: 0,
            rewardUuid: tpl.rewardUuid || "",
            rewardType: tpl.rewardType || "item",
            isCompleted: false,
          });
          await actor.setFlag(this.ID, "projects", projects);
        }
      });
    }

    // Guidance Tier Change Listener
    html.querySelectorAll(".update-project").forEach((select) => {
      select.addEventListener("change", async (ev) => {
        const target = ev.currentTarget as HTMLSelectElement | null;
        if (!target || !target.dataset) return;

        const { actorId, projId } = target.dataset;
        if (!actorId || !projId) return;
        const val = target.value;
        const targetActor = (game.actors?.get(actorId as string) || actor) as Actor;
        const projects = targetActor.getFlag(this.ID, "projects") || [];
        const p = projects.find((x) => x.id === projId);
        const tiers = Settings.guidanceTiers;
        const tier = tiers.find((t) => t.id === val);

        if (p && tier) {
          p.guidanceTierId = tier.id; // Updated to guidanceTierId
          p.tutelage = tier.modifier;
          await targetActor.setFlag(this.ID, "projects", projects);
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

        const { actorId, projId } = target.dataset;
        const newProgress = parseInt(target.value) || 0;
        const targetActor = game.actors?.get(actorId as string) as Actor | undefined;
        if (!targetActor) return;

        const projects = targetActor.getFlag(this.ID, "projects") || [];
        const p = projects.find((x) => x.id === projId);

        if (p) {
          p.progress = Math.min(newProgress, p.maxProgress);
          if (p.progress >= p.maxProgress && !p.isCompleted) {
            p.isCompleted = true;
            await this.grantProjectReward(targetActor as Actor, p); // Fixed: targetActor instead of actor
          }
          await targetActor.setFlag(this.ID, "projects", projects);
        }
      });
    });

    // Grant Time Dialog Listener
    const grantBtn = html.querySelector(".grant-time-btn");
    if (grantBtn) {
      grantBtn.addEventListener("click", async () => {
        if (!game.user?.isGM) return;

        const timeUnits = Settings.timeUnits;
        const isParty = (actor.type as string) === "group";

        const members = isParty
          ? (actor as DowntimeGroupActor).system.members
              .map((m) => this.mapMemberData(m, timeUnits))
              .filter((m) => !!m)
          : [];

        const templateData = { timeUnits, isParty, members };
        const content = await renderTemplate(
          `modules/${this.ID}/templates/grant-time-dialog.hbs`,
          templateData,
        );

        new Dialog({
          title: "Distribute Training Time",
          content: content,
          buttons: {
            apply: {
              label: "Grant Time",
              icon: '<i class="fas fa-check"></i>',
              callback: async (dialogHtml: JQuery | HTMLElement) => {
                // Determine correct HTML element wrapper based on Foundry version behavior
                const htmlElement = dialogHtml instanceof HTMLElement ? dialogHtml : dialogHtml[0];
                const form = htmlElement.querySelector("form");
                if (!form) return;

                const formData = new FormData(form);

                // Calculate total
                let totalBase = 0;
                timeUnits.forEach((tu) => {
                  totalBase += (parseInt(formData.get(`time_${tu.id}`) as string) || 0) * tu.ratio;
                });

                if (totalBase === 0) return ui.notifications?.warn("No time entered.");

                // Determine final recipient IDs
                const selectedIds = isParty
                  ? members.filter((m: any) => formData.has(`actor_${m.id}`)).map((m: any) => m.id)
                  : [actor.id];

                if (selectedIds.length === 0)
                  return ui.notifications?.warn("No recipients selected.");

                // Batch update
                for (const id of selectedIds) {
                  const a = game.actors?.get(id) as Actor | undefined;
                  if (!(a instanceof (globalThis.Actor || Object))) continue;
                  const bank = a.getFlag(this.ID, "bank") || { total: 0 };
                  await a.setFlag(this.ID, "bank", { total: (bank.total || 0) + totalBase });
                }

                (ChatMessage.implementation as any).create({
                  speaker: { alias: "Downtime System" },
                  content: `Granted <strong>${this.formatTimeBank(totalBase, timeUnits)}</strong> to ${selectedIds.length} characters.`,
                });
              },
            },
          },
          default: "apply",
        }).render(true);
      });
    }
  }

  private static async processTraining(actor: DowntimeActor, projId: string, unitId: string) {
    const rules = Settings.rules;
    const library = Settings.guidanceTiers;
    const timeUnits = Settings.timeUnits;

    const bank = actor.getFlag(this.ID, "bank") || { total: 0 };
    const projects = actor.getFlag(this.ID, "projects") || [];
    const p = projects.find((x) => x.id === projId);
    const tu = timeUnits.find((x) => x.id === unitId);

    if (!p || !tu || bank.total < tu.ratio) return ui.notifications?.warn(`Not enough time!`);

    const tier = library.find((t) => t.id === p.guidanceTierId) || {
      id: "unknown",
      name: "Unknown",
      modifier: 0,
      costs: {},
      progress: {},
    };
    const costGp = tier.costs?.[tu.id] || 0;
    const costCp = Math.round(costGp * 100);

    const cur = actor.system.currency;
    const totalCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (totalCp < costCp) return ui.notifications?.warn(`Need ${costGp}gp!`);

    let progressGained = 0;
    if (tu.isBulk) {
      progressGained = tier.progress?.[tu.id] || 0;
    } else if (rules.method === "roll") {
      const roll = await new Roll(rules.checkFormula, {
        ...actor.getRollData(),
        tutelage: tier.modifier,
      }).evaluate();

      // Defensive check for roll results
      const firstDie = roll.dice?.[0];
      const isNat20 = firstDie?.results?.[0]?.result === 20;

      if (roll.total >= rules.checkDC || isNat20) progressGained = isNat20 ? 2 : 1;
      await roll.toMessage({ flavor: `Learning Check: ${p.name}` });
    } else progressGained = 1;

    // Await the deduction check. If it fails (which shouldn't happen due to the check above, but safe), abort.
    const didDeduct = await this.deductCurrency(actor, costGp);
    if (!didDeduct) return;

    p.progress = Math.min(p.progress + progressGained, p.maxProgress);

    if (p.progress >= p.maxProgress && !p.isCompleted) {
      p.isCompleted = true;
      await this.grantProjectReward(actor, p);
    }

    await actor.setFlag(this.ID, "bank", { total: bank.total - tu.ratio });
    await actor.setFlag(this.ID, "projects", projects);
  }

  private static async deductCurrency(actor: DowntimeActor, amountGp: number): Promise<boolean> {
    const costCp = Math.round(amountGp * 100);
    const cur = actor.system.currency;
    let walletCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (walletCp < costCp) return false;

    walletCp -= costCp;
    await actor.update({
      system: {
        currency: {
          gp: Math.floor(walletCp / 100),
          sp: Math.floor((walletCp % 100) / 10),
          cp: walletCp % 10,
        },
      },
    });
    return true;
  }

  private static getMemberId(member: any): string | null {
    if (member.ids instanceof Set) return (Array.from(member.ids)[0] as string) || null;
    return member.actorId || member.id || null;
  }

  private static mapMemberData(member: any, timeUnits: TimeUnit[]): any {
    const actorId = this.getMemberId(member);
    const actualActor = member.actor || (actorId ? game.actors?.get(actorId as string) : null);

    if (!(actualActor instanceof (globalThis.Actor || Object))) return null;
    const a = actualActor as Actor;

    const bank = a.getFlag(this.ID, "bank") || { total: 0 };
    const projects = (a.getFlag(this.ID, "projects") || []).map((p: any) => {
      const tier = Settings.guidanceTiers.find((t) => t.id === p.guidanceTierId);
      return {
        ...p,
        guidanceType: tier ? tier.name : "None",
      };
    });

    return {
      id: a.id,
      name: a.name,
      img: a.img,
      formattedBank: this.formatTimeBank(bank.total, timeUnits),
      projects: projects.filter((p) => !p.isCompleted),
    };
  }

  private static async grantProjectReward(actor: Actor, project: LearningProject) {
    if (!project.rewardUuid) return;

    try {
      const rewardDoc = await fromUuid(project.rewardUuid as any);
      if (!rewardDoc) return;
      const rewardType = project.rewardType === "effect" ? "effect" : "item";

      if (rewardType === "item" && rewardDoc instanceof Item) {
        await actor.createEmbeddedDocuments("Item", [rewardDoc.toObject()]);
        ui.notifications?.info(`Learning Complete: ${actor.name} gained item ${rewardDoc.name}!`);
      } else if (rewardType === "effect" && rewardDoc instanceof ActiveEffect) {
        const effectData = rewardDoc.toObject() as any;
        effectData.origin = actor.uuid;

        await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
        ui.notifications?.info(`Learning Complete: ${actor.name} gained effect ${rewardDoc.name}!`);
      }
    } catch (err) {
      console.error(`${this.ID} | Failed to grant reward:`, err);
    }
  }
}

Hooks.once("init", () => TheFehrsLearningManager.init());
