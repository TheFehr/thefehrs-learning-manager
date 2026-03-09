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
import { migrateData } from "./migration";
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
}

Hooks.once("init", () => TheFehrsLearningManager.init());
Hooks.once("ready", () => {
  console.debug("Downtime Engine | Initialized");
  migrateData();
});
