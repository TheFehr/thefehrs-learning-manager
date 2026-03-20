import type {
  TimeUnit,
  Tidy5eApi,
  Tidy5eTabGetDataParams,
  Tidy5eTabRenderParams,
  DowntimeGroupActor,
  SystemRules,
  GuidanceTier,
  OnRenderTabParams,
} from "./types";
import { LearningConfigApp } from "./settings-app";
import { Settings } from "./settings";
import { PartyTab as PartyTabLogic } from "./tabs/party-tab";
import PartyTab from "./tabs/PartyTab.svelte";
import { TabLogic } from "./tabs/tab-logic";
import ItemTargetConfig from "./tabs/ItemTargetConfig.svelte";
import { migrateData } from "./migration";
import { mount, unmount } from "svelte";
import { ProjectEngine } from "./project-engine";
import { ProjectItem } from "./data/project-item";

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
      const timeUnitId = activity.flags?.[Settings.ID]?.timeUnitId;
      if (timeUnitId) {
        ProjectEngine.processTraining(activity.item, timeUnitId);
        return false; // Stop standard execution
      }
    });

    Hooks.on("dropActorSheetData", (actor: Actor, sheet: any, data: any) => {
      if (data.type !== "Item" || !data.uuid) return true;

      const isCompendium = data.uuid.startsWith("Compendium.");
      if (!isCompendium) return true;

      const parts = data.uuid.split(".");
      const packId = `${parts[1]}.${parts[2]}`;
      const allowed = Settings.allowedCompendiums;

      if (!allowed.includes(packId)) return true;

      // INTERCEPT: The item is from an allowed compendium.
      // We will now handle this as a Learning Project initiation.

      let targetActor = actor;

      if (actor.type === "group") {
        const event = (window as any).event as DragEvent | undefined;
        const target = event?.target as HTMLElement | undefined;

        const actorRow = target?.closest('[data-tidy-section-key^="actor-"]') as
          | HTMLElement
          | undefined;
        const sidebarEntry = target?.closest("[data-actor-id]") as HTMLElement | undefined;

        const actorId =
          actorRow?.dataset.tidySectionKey?.replace("actor-", "") || sidebarEntry?.dataset.actorId;

        if (actorId) {
          const member = game.actors?.get(actorId);
          if (member) targetActor = member;
        } else {
          // It's a group actor but we didn't find a member to assign to.
          // Still return false to prevent the "Only physical items" error
          // from the standard drop handler.
          return false;
        }
      }

      fromUuid(data.uuid).then((item) => {
        if (item instanceof Item) {
          const itemProxy = new ProjectItem(item);
          const projectData = itemProxy.projectData;
          const requirements = projectData.requirements || [];
          const { eligible, reason } = TabLogic.meetsRequirements(targetActor, requirements);

          if (!eligible) {
            return ui.notifications?.warn(`Requirements not met for ${item.name}: ${reason}`);
          }

          ProjectEngine.initiateProjectFromItem(targetActor, item);
        }
      });
      return false; // Stop standard drop behavior completely
    });

    Hooks.once("tidy5e-sheet.ready" as any, (api: Tidy5eApi) => {
      console.debug("Downtime Engine | Tidy5e API ready, registering tabs");

      api.registerGroupTab(
        new api.models.HtmlTab({
          title: "Group Learning",
          iconClass: "fa-solid fa-book-open-cover",
          tabId: "thefehrs-party-tab",
          html: '<div class="downtime-engine-svelte-root tidy5e-sheet tidy-sheet-body tab-content" style="height: 100%; display: flex; flex-direction: column;"></div>',
          onRender: (params: OnRenderTabParams) => {
            const appId = params.app.id;
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
              target: params.tabContentsElement,
              props: props,
            });

            this.svelteInstances.set(appId, instance);
          },
        }),
      );

      api.registerItemTab(
        new api.models.HtmlTab({
          tabContentsClasses: ["downtime-engine-item-tab"],
          title: "Learning",
          iconClass: "fa-solid fa-book-open-cover",
          tabId: `${this.ID}-item-target-config`,
          html: '<div class="downtime-engine-svelte-root" style="height: 100%;"></div>',
          enabled: (context: any) => {
            if (!game.user?.isGM) return false;
            const item =
              context?.item || context?.document || context?.app?.document || context?.app?.actor;
            if (!item) return false;

            // Check if it's our custom "learning" type (feat subtype learningProject)
            // or if it has the explicit project flag
            const isLearningType =
              item.type === "feat" && (item as any).system?.type?.value === "learningProject";
            const isProject = item.getFlag(this.ID, "isLearningProject");

            if (isLearningType || isProject) return true;

            // Check if in allowed compendium
            const uuid = item.uuid || "";
            if (uuid.startsWith("Compendium.")) {
              const parts = uuid.split(".");
              const packId = `${parts[1]}.${parts[2]}`;
              return Settings.allowedCompendiums.includes(packId);
            }

            return false;
          },
          onRender: (params) => {
            const appId = params.app.id;
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

      let html = (data: any) => {
        // Tidy passes the document context in 'data'
        const item = data.document || data.item;
        const projectData = item?.getFlag(TheFehrsLearningManager.ID, "projectData");

        console.debug(projectData, item);
        if (!projectData || !projectData.target) return "";

        const progress = projectData.progress || 0;
        const target = projectData.target;
        const percentage = Math.min(100, Math.max(0, (progress / target) * 100));

        // Uses Tidy5e native CSS variables (--t5e-*) to match their specific themes
        return `
    <div class="learning-manager-progress-container" style="margin: 0.5rem 0 1rem 0; padding: 0.5rem; border: 1px solid var(--t5e-color-border); border-radius: 4px; background: var(--t5e-color-background-light);">
      <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 4px; font-family: var(--t5e-font-family);">
        <span>Training Progress</span>
        <span>${progress} / ${target}</span>
      </div>
      <div style="width: 100%; height: 14px; background: var(--t5e-color-background-dark); border-radius: 7px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);">
        <div style="width: ${percentage}%; height: 100%; background: var(--color-level-success, #4caf50); transition: width 0.4s ease-in-out;"></div>
      </div>
    </div>
  `;
      };
      let enabled = (data: any) => {
        console.debug(data);
        const item = data.document || data.item;
        return !!item?.getFlag(TheFehrsLearningManager.ID, "isLearningProject");
      };
      api.registerItemContent(
        new api.models.HtmlContent({
          // 1. Build the HTML dynamically based on the current context data
          html: html,
          // 2. Tell Tidy exactly where to put it
          injectParams: {
            // selector: `[data-tab-contents-for="description"]`,
            selector: `section.item-descriptions`,
            position: "beforebegin",
          },
          // 3. Only render if it's actually a learning project
          enabled: enabled,
          // 4. Force Tidy to re-calculate this block whenever the sheet updates
          renderScheme: "handlebars",
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
    Settings.register("projectTemplates", {
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
  if (TheFehrsLearningManager.svelteInstances.has(app.id)) {
    unmount(TheFehrsLearningManager.svelteInstances.get(app.id));
    TheFehrsLearningManager.svelteInstances.delete(app.id);
  }
});

Hooks.once("ready", async () => {
  console.debug("Downtime Engine | Initialized");
  await migrateData();
});
