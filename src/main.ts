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
import { PartyTab as PartyTabLogic } from "./tabs/party-tab";
import PartyTab from "./tabs/PartyTab.svelte";
import ItemTargetConfig from "./tabs/ItemTargetConfig.svelte";
import { migrateData } from "./migration";
import { mount, unmount } from "svelte";
import { ProjectEngine } from "./project-engine";

export class TheFehrsLearningManager {
  static ID = "thefehrs-learning-manager" as const;
  static svelteInstances = new Map<string | number, any>();

  static init() {
    this.registerSettings();

    (CONFIG as any).DND5E.featureTypes.learningProject = {
      label: "In-Progress Learning",
    };

    Settings.registerMenu("configMenu", {
      name: "Downtime Engine Config",
      label: "Open Settings Panel",
      hint: "Configure the Downtime Engine",
      icon: "fas fa-cogs",
      type: LearningConfigApp,
      restricted: true,
    });

    Hooks.on("dnd5e.preUseActivity" as any, (activity: any, _config: any, _options: any) => {
      const timeUnitId = activity.getFlag(Settings.ID, "timeUnitId");
      if (timeUnitId) {
        ProjectEngine.processTraining(activity.item, timeUnitId);
        return false; // Stop standard execution
      }
    });

    Hooks.on("dropActorSheetData", (actor: Actor, data: any) => {
      if (data.type !== "Item" || !data.uuid) return true;

      const isCompendium = data.uuid.startsWith("Compendium.");
      if (!isCompendium) return true;

      const parts = data.uuid.split(".");
      const packId = `${parts[1]}.${parts[2]}`;
      const allowed = Settings.allowedCompendiums;

      if (!allowed.includes(packId)) return true;

      // Check if dropped on our section or Group Sheet
      // We can look at the event target if it exists
      const event = (window as any).event as DragEvent | undefined;
      const target = event?.target as HTMLElement | undefined;

      const isLearningSection = !!target?.closest('[data-tidy-section*="learningProject"]');
      const isGroupSheet = !!target?.closest(".thefehrs-party-tab");

      if (isLearningSection || isGroupSheet) {
        fromUuid(data.uuid).then((item) => {
          if (item instanceof Item) {
            ProjectEngine.initiateProjectFromItem(actor, item);
          }
        });
        return false; // Stop standard drop
      }

      return true;
    });

    Hooks.once("tidy5e-sheet.ready" as any, (api: Tidy5eApi) => {
      console.debug("Downtime Engine | Tidy5e API ready, registering tabs");

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

      api.registerItemTab(
        new api.models.HtmlTab({
          title: "Learning",
          iconClass: "fa-solid fa-book-open-cover",
          tabId: `${this.ID}-item-target-config`,
          html: '<div class="downtime-engine-svelte-root" style="height: 100%;"></div>',
          onRender: (params: Tidy5eTabRenderParams) => {
            if (!game.user?.isGM) return;

            const appId = params.app.appId;
            const target = params.element.querySelector(".downtime-engine-svelte-root");
            if (!target) return;

            if (this.svelteInstances.has(appId)) {
              unmount(this.svelteInstances.get(appId));
              this.svelteInstances.delete(appId);
            }

            const item = params.app.document || params.app.actor;
            if (!item) return;

            const instance = mount(ItemTargetConfig, {
              target: target,
              props: { item },
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
      onChange: () => {
        ProjectEngine.syncAllProjectActivities();
      },
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
    Settings.register("allowedCompendiums", {
      scope: "world",
      config: false,
      type: Array,
      default: [],
    });
    Settings.register("migrationVersion", {
      scope: "world",
      config: false,
      type: String,
      default: "0",
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
