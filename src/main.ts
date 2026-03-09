import type {
  LearningProject,
  TimeUnit,
  Tidy5eApi,
  Tidy5eTabGetDataParams,
  Tidy5eTabRenderParams,
  DowntimeGroupActor,
  SystemRules,
  GuidanceTier,
} from "./types";
import { LearningConfigApp } from "./settings-app";
import { Settings } from "./settings";
import { ActorProxy } from "./actor-proxy";
import { LearningTab } from "./tabs/learning-tab";
import { PartyTab } from "./tabs/party-tab";
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
          getData: async (data: Tidy5eTabGetDataParams) => await LearningTab.getData(data.actor),
          onRender: (params: Tidy5eTabRenderParams) => {
            const sheetActor = params.app.document || params.app.actor;
            if (sheetActor) LearningTab.activateListeners(params.element, sheetActor);
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
            await PartyTab.getData(data.actor as DowntimeGroupActor),
          onRender: (params: Tidy5eTabRenderParams) => {
            const sheetActor = params.app.document || params.app.actor;
            if (sheetActor) PartyTab.activateListeners(params.element, sheetActor);
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
    if (version >= 2 || !game.user?.isGM) return;

    if (version < 1) {
      ui.notifications?.info("Migrating Downtime Engine projects to relational schema...");
      try {
        const library = Settings.projectTemplates;
        let libraryUpdated = false;

        for (const actor of (game.actors || []) as any[]) {
          const proxy = ActorProxy.forActor(actor);
          const projects = (proxy.projects as any[]) || [];
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
                target: p.maxProgress ?? 100,
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
        ui?.notifications?.info("Downtime Engine projects migrated successfully!");
      } catch (error) {
        console.error("Downtime Engine migration failed:", error);
        ui?.notifications?.error("Migration failed. Please check the console for details.");
      }
    }

    if (version < 2) {
      ui.notifications?.info("Migrating Downtime Engine guidance costs from gp to cp...");
      try {
        const tiers = Settings.guidanceTiers;
        let tiersUpdated = false;
        for (const tier of tiers) {
          if (tier.costs) {
            for (const key of Object.keys(tier.costs)) {
              if (tier.costs[key] > 0 && tier.costs[key] < 100) {
                // arbitrary heuristic to catch gp values vs cp values since we don't store versions per document. Usually users used like 1.5 etc, in cp it is 150. Wait this heuristic might be dangerous. But the guidance cost was previously in gp and now it is in cp. So multiplying by 100 is the migration.
                tier.costs[key] = Math.round(tier.costs[key] * 100);
                tiersUpdated = true;
              }
            }
          }
        }
        if (tiersUpdated) {
          await Settings.setGuidanceTiers(tiers);
        }
        await Settings.setMigrationVersion(2);
        ui?.notifications?.info("Downtime Engine guidance costs migrated to cp successfully!");
      } catch (error) {
        console.error("Downtime Engine migration to v2 failed:", error);
        ui?.notifications?.error("Migration to v2 failed. Please check the console for details.");
      }
    }
  }
}

Hooks.once("init", () => TheFehrsLearningManager.init());
Hooks.once("ready", () => {
  console.debug("Downtime Engine | Initialized");
  TheFehrsLearningManager.migrateData();
});
