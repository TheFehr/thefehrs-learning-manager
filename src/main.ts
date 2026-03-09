import type {
  ProjectTemplate,
  LearningProject,
  TimeUnit,
  Tidy5eApi,
  Tidy5eTabGetDataParams,
  Tidy5eTabRenderParams,
  DowntimeActor,
  DowntimeGroupActor,
  ProjectRequirement,
  SystemRules,
  GuidanceTier,
} from "./types";
import { LearningConfigApp } from "./settings-app";
import { Settings } from "./settings";
import { ActorProxy } from "./actor-proxy";
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
    const rules: SystemRules = {
      method: "direct",
    };
    Settings.register("rules", {
      scope: "world",
      config: false,
      type: Object,
      default: rules,
    });

    const timeUnits: TimeUnit[] = [
      { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
      { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
      { id: "week", name: "Week", short: "w", isBulk: true, ratio: 70 },
    ];
    Settings.register("timeUnits", {
      scope: "world",
      config: false,
      type: Array,
      default: timeUnits,
    });

    const guidanceTiers: GuidanceTier[] = [
      {
        id: "example_tier",
        name: "Example Tier",
        modifier: 2,
        costs: { hour: 0, day: 0, week: 0 },
        progress: { day: 1, week: 7 },
      },
    ];
    Settings.register("guidanceTiers", {
      scope: "world",
      config: false,
      type: Array,
      default: guidanceTiers,
    });
    Settings.register("projectTemplates", {
      scope: "world",
      config: false,
      type: Array,
      default: [],
    });
    Settings.register("migrationVersion", {
      scope: "world",
      config: false,
      type: Number,
      default: 0,
    });
  }

  static async migrateData() {
    const version = Settings.migrationVersion;
    if (version >= 1 || !game.user?.isGM) return;

    ui.notifications?.info("Migrating Downtime Engine projects to relational schema...");
    const library = Settings.projectTemplates;
    let libraryUpdated = false;

    for (const actor of game.actors || []) {
      const proxy = ActorProxy.forActor(actor);
      const projects = proxy.projects;
      if (!projects || projects.length === 0) continue;

      let actorUpdated = false;
      const migratedProjects: LearningProject[] = [];

      for (const p of projects) {
        if (p.templateId) {
          migratedProjects.push(p);
          continue;
        }

        let tpl = library.find((t) => t.name === p.name);
        if (!tpl) {
          tpl = {
            id: foundry.utils.randomID(),
            name: p.name,
            target: p.maxProgress || 100,
            rewardUuid: p.rewardUuid || "",
            rewardType: p.rewardType || "item",
            requirements: [],
          };
          library.push(tpl);
          libraryUpdated = true;
        }

        migratedProjects.push({
          id: p.id,
          templateId: tpl.id,
          progress: p.progress || 0,
          guidanceTierId: p.guidanceTierId || "",
          isCompleted: p.isCompleted || false,
        });
        actorUpdated = true;
      }

      if (actorUpdated) await proxy.setProjects(migratedProjects);
    }

    if (libraryUpdated) await Settings.setProjectTemplates(library);
    await Settings.setMigrationVersion(1);
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
    const proxy = ActorProxy.forActor(actor);
    const timeUnits = Settings.timeUnits;
    const bank = proxy.bank;

    // Evaluate the library for this specific actor
    const library = Settings.projectTemplates.map((tpl) => {
      const eligibility = this.meetsRequirements(actor, tpl.requirements || []);
      const label = `${tpl.name} (${tpl.target})${!eligibility.eligible ? " - Locked" : ""}`;
      return {
        ...tpl,
        isEligible: eligibility.eligible,
        ineligibilityReason: eligibility.reason,
        label,
        disabled: !eligibility.eligible,
        title: !eligibility.eligible ? eligibility.reason : "",
      };
    });

    const allProjects = proxy.projects
      .map((p: any) => {
        const tier = Settings.guidanceTiers.find((t) => t.id === p.guidanceTierId);
        const tpl = library.find((t) => t.id === p.templateId);
        if (!tpl) return null;

        return {
          ...p,
          name: tpl.name,
          maxProgress: tpl.target,
          percent: Math.min((p.progress / tpl.target) * 100, 100),
          isCompleted: p.progress >= tpl.target || p.isCompleted,
          guidanceType: tier ? tier.name : "None",
        };
      })
      .filter((p: any) => p !== null);

    return {
      formattedBank: this.formatTimeBank(bank.total, timeUnits),
      timeUnits,
      activeProjects: allProjects.filter((p: any) => !p.isCompleted),
      completedProjects: allProjects.filter((p: any) => p.isCompleted),
      library,
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
          // Double-check eligibility using the helper
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

        const { actorId, projId } = target.dataset;
        if (!actorId || !projId) return;
        const val = target.value;
        const targetActor = (game.actors?.get(actorId as string) || actor) as Actor;
        const proxy = ActorProxy.forActor(targetActor);
        const projects = proxy.projects;
        const p = projects.find((x) => x.id === projId);
        const tiers = Settings.guidanceTiers;
        const tier = tiers.find((t) => t.id === val);

        if (p && tier) {
          p.guidanceTierId = tier.id; // Updated to guidanceTierId
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

        const { actorId, projId } = target.dataset;
        const newProgress = parseInt(target.value) || 0;
        const targetActor = game.actors?.get(actorId as string) as Actor | undefined;
        if (!targetActor) return;

        const proxy = ActorProxy.forActor(targetActor);
        const projects = proxy.projects;
        const p = projects.find((x) => x.id === projId);

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
                  const proxy = ActorProxy.forActor(a);
                  const bank = proxy.bank;
                  await proxy.setBank({ total: (bank.total || 0) + totalBase });
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

    const proxy = ActorProxy.forActor(actor);
    const bank = proxy.bank;
    const projects = proxy.projects;
    const p = projects.find((x) => x.id === projId);
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

    let progressGained = 0;
    if (tu.isBulk) {
      progressGained = tier.progress?.[tu.id] || 0;
    } else if (rules.method === "roll") {
      const roll = await new Roll(rules.checkFormula, {
        ...actor.getRollData(),
        tutelage: tier.modifier, // Dynamically sourced from Settings
      }).evaluate();

      const firstDie = roll.dice?.[0];
      const isNat20 = firstDie?.results?.[0]?.result === 20;

      if (roll.total >= rules.checkDC || isNat20) progressGained = isNat20 ? 2 : 1;
      await roll.toMessage({ flavor: `Learning Check: ${tpl.name}` });
    } else progressGained = 1;

    const didDeduct = await this.deductCurrency(actor, costGp);
    if (!didDeduct) return;

    p.progress = Math.min(p.progress + progressGained, tpl.target);

    if (p.progress >= tpl.target && !p.isCompleted) {
      p.isCompleted = true;
      await this.grantProjectReward(actor, tpl);
    }

    await proxy.setBank({ total: bank.total - tu.ratio });
    await proxy.setProjects(projects);
  }

  private static mapMemberData(member: any, timeUnits: TimeUnit[]): any {
    const actorId = this.getMemberId(member);
    const actualActor = member.actor || (actorId ? game.actors?.get(actorId as string) : null);

    if (!(actualActor instanceof (globalThis.Actor || Object))) return null;
    const a = actualActor as Actor;
    const proxy = ActorProxy.forActor(a);

    const bank = proxy.bank;
    const library = Settings.projectTemplates;

    const projects = proxy.projects
      .map((p: any) => {
        const tier = Settings.guidanceTiers.find((t) => t.id === p.guidanceTierId);
        const tpl = library.find((t) => t.id === p.templateId);
        if (!tpl) return null;

        return {
          ...p,
          name: tpl.name,
          maxProgress: tpl.target,
          guidanceType: tier ? tier.name : "None",
        };
      })
      .filter((p: any) => p !== null);

    return {
      id: proxy.id,
      name: proxy.name,
      img: proxy.img,
      currency: proxy.currency,
      formattedBank: this.formatTimeBank(bank.total, timeUnits),
      projects: projects.filter((p: any) => !p.isCompleted),
    };
  }

  // Changed signature to accept ProjectTemplate
  private static async grantProjectReward(actor: Actor, template: ProjectTemplate) {
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
    } catch (err) {
      console.error(`${this.ID} | Failed to grant reward:`, err);
    }
  }

  private static meetsRequirements(
    actor: Actor,
    requirements: ProjectRequirement[],
  ): {
    eligible: boolean;
    reason?: string;
  } {
    if (!requirements || requirements.length === 0) return { eligible: true };

    for (const req of requirements) {
      if (!req.attribute) continue;

      const actorVal = foundry.utils.getProperty(actor, req.attribute);
      let targetVal: any = req.value;

      if (!isNaN(Number(targetVal)) && targetVal.trim() !== "") targetVal = Number(targetVal);

      let passed = false;
      switch (req.operator) {
        case "===":
          passed = actorVal === targetVal;
          break;
        case "!==":
          passed = actorVal !== targetVal;
          break;
        case ">":
          passed = Number(actorVal) > targetVal;
          break;
        case ">=":
          passed = Number(actorVal) >= targetVal;
          break;
        case "<":
          passed = Number(actorVal) < targetVal;
          break;
        case "<=":
          passed = Number(actorVal) <= targetVal;
          break;
        case "includes":
          passed =
            Array.isArray(actorVal) || typeof actorVal === "string"
              ? actorVal.includes(targetVal)
              : false;
          break;
      }

      if (!passed) {
        return {
          eligible: false,
          reason: `Requires ${req.attribute} ${req.operator} ${targetVal}`,
        };
      }
    }

    return { eligible: true };
  }

  private static async deductCurrency(actor: DowntimeActor, amountGp: number): Promise<boolean> {
    const proxy = ActorProxy.forActor(actor);
    const costCp = Math.round(amountGp * 100);
    const cur = proxy.currency;
    let walletCp = cur.gp * 100 + cur.sp * 10 + cur.cp;

    if (walletCp < costCp) return false;

    walletCp -= costCp;
    await proxy.updateCurrency({
      gp: Math.floor(walletCp / 100),
      sp: Math.floor((walletCp % 100) / 10),
      cp: walletCp % 10,
    });
    return true;
  }

  private static getMemberId(member: any): string | null {
    if (member.ids instanceof Set) return (Array.from(member.ids)[0] as string) || null;
    return member.actorId || member.id || null;
  }
}

Hooks.once("init", () => TheFehrsLearningManager.init());
