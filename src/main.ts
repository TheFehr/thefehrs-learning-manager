import type {
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
import { LearningTab as LearningTabLogic } from "./tabs/learning-tab";
import { PartyTab as PartyTabLogic } from "./tabs/party-tab";
import PartyTab from "./tabs/PartyTab.svelte";
import LearningTab from "./tabs/LearningTab.svelte";
import { migrateData } from "./migration";
import { mount, unmount } from "svelte";

export class TheFehrsLearningManager {
  static ID = "thefehrs-learning-manager" as const;
  static svelteInstances = new Map<string | number, any>();

  static init() {
    this.registerSettings();

    Settings.registerMenu("configMenu", {
      name: "Downtime Engine Config",
      label: "Open Settings Panel",
      hint: "Configure the Downtime Engine",
      icon: "fas fa-cogs",
      type: LearningConfigApp,
      restricted: true,
    });

    Hooks.once("tidy5e-sheet.ready" as any, (api: Tidy5eApi) => {
      console.debug("Downtime Engine | Tidy5e API ready, registering tabs");

      api.registerCharacterTab(
        new api.models.HtmlTab({
          title: "Learning",
          iconClass: "fa-solid fa-book-open-cover",
          tabId: "thefehrs-learning-tab",
          html: '<div class="downtime-engine-svelte-root tidy5e-sheet tidy-sheet-body tab-content" style="height: 100%; display: flex; flex-direction: column;"></div>',
          onRender: (params: Tidy5eTabRenderParams) => {
            const appId = params.app.appId;
            const target = params.element.querySelector(".downtime-engine-svelte-root");
            if (!target) return;

            if (this.svelteInstances.has(appId)) {
              unmount(this.svelteInstances.get(appId));
              this.svelteInstances.delete(appId);
            }

            const actor = params.app.document || params.app.actor;
            if (!actor) return;

            const instance = mount(LearningTab, {
              target: target,
              props: { actor },
            });

            this.svelteInstances.set(appId, instance);
          },
        }),
      );

      api.registerActorTab(
        new api.models.HtmlTab({
          title: "Group Learning",
          iconClass: "fa-solid fa-book-open-cover",
          tabId: "thefehrs-party-tab",
          html: '<div class="downtime-engine-svelte-root tidy5e-sheet tidy-sheet-body tab-content" style="height: 100%; display: flex; flex-direction: column;"></div>',
          onRender: (params: Tidy5eTabRenderParams) => {
            const appId = params.app.appId;
            const target = params.element.querySelector(".downtime-engine-svelte-root");
            if (!target) return;

            // Unmount existing instance to prevent duplicates and memory leaks
            if (this.svelteInstances.has(appId)) {
              unmount(this.svelteInstances.get(appId));
              this.svelteInstances.delete(appId);
            }

            const actor = params.app.document || params.app.actor;
            if (!actor) {
              console.warn("Downtime Engine | Could not extract Actor for Party Tab");
              return;
            }

            const partyData = PartyTabLogic.getData(actor as DowntimeGroupActor);
            const props = {
              ...partyData,
              actor,
            };

            const instance = mount(PartyTab, {
              target: target,
              props: props,
            });

            this.svelteInstances.set(appId, instance);
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

Hooks.on("closeApplication", (app: any) => {
  if (TheFehrsLearningManager.svelteInstances.has(app.appId)) {
    unmount(TheFehrsLearningManager.svelteInstances.get(app.appId));
    TheFehrsLearningManager.svelteInstances.delete(app.appId);
  }
});

Hooks.once("ready", async () => {
  console.debug("Downtime Engine | Initialized");
  await migrateData();
});
