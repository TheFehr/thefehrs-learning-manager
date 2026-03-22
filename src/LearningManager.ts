import type {
  GuidanceTier,
  SystemRules,
  TimeUnit,
  Tidy5eApi,
  DowntimeGroupActor,
  OnRenderTabParams,
  Actor5e,
  Item5e,
} from "./types.js";
import { ProjectEngine } from "./project-engine.js";
import { Settings } from "./core/settings.js";
import { LearningConfigApp } from "./apps/settings-app.js";
import { TabLogic } from "./tab-logic.js";
import {
  ProjectItem,
  projectData,
  LearningFeatType,
  LearningActivityData,
} from "./project-item.js";
import { mount, unmount } from "svelte";
import PartyTab from "./apps/tabs/PartyTab.svelte";
import { PartyTab as PartyTabLogic } from "./party-tab.js";
import ItemTargetConfig from "./apps/tabs/ItemTargetConfig.svelte";

export class LearningManager {
  static ID = "thefehrs-learning-manager" as const;
  static svelteInstances = new Map<string | number, Record<string, unknown>>();

  static init() {
    this.registerSettings();
    this.registerConfigExpansions();
    this.registerHooks();

    Settings.registerMenu("configMenu", {
      name: "Downtime Engine Config",
      label: "Open Settings Panel",
      hint: "Configure the Downtime Engine",
      icon: "fas fa-cogs",
      type: LearningConfigApp,
      restricted: true,
    });
  }

  private static registerSettings() {
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
      onChange: async () => {
        try {
          await ProjectEngine.syncAllProjectActivities();
        } catch (err) {
          console.error("Downtime Engine | Failed to sync activities after time unit change:", err);
        }
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

  private static registerConfigExpansions() {
    CONFIG.DND5E.featureTypes[LearningFeatType] = {
      label: "In-Progress Learning",
    };
  }

  private static registerHooks() {
    // @ts-expect-error - dnd5e system hook
    Hooks.on("dnd5e.preUseActivity", (activity: LearningActivityData) => {
      // Check if this is a learning activity
      if (activity.flags?.[LearningManager.ID]?.isLearningActivity) {
        ProjectEngine.processTraining(activity);
        return false; // stop standard execution
      }
    });

    Hooks.on(
      "dropActorSheetData",
      (actor: Actor, _sheet: unknown, data: { type: string; uuid: string }) => {
        if (data.type !== "Item" || !data.uuid) return true;

        const isCompendium = data.uuid.startsWith("Compendium.");
        if (!isCompendium) return true;

        const parts = data.uuid.split(".");
        const packId = `${parts[1]}.${parts[2]}`;
        const allowed = Settings.allowedCompendiums;

        if (!allowed.includes(packId)) return true;

        let targetActor = actor as unknown as Actor5e;

        if ((targetActor.type as string) === "group") {
          // Find the actual drag event from the global window object (legacy but often necessary in Foundry hooks)
          const event = (window as unknown as { event: DragEvent }).event;
          const target = event?.target as HTMLElement | undefined;

          const actorRow = target?.closest('[data-tidy-section-key^="actor-"]') as
            | HTMLElement
            | undefined;
          const sidebarEntry = target?.closest("[data-actor-id]") as HTMLElement | undefined;

          const actorId =
            actorRow?.dataset.tidySectionKey?.replace("actor-", "") ||
            sidebarEntry?.dataset.actorId;

          if (actorId) {
            const member = game.actors?.get(actorId);
            if (member) targetActor = member as unknown as Actor5e;
          } else {
            // If we can't find a specific member via the event target,
            // we might be dropping on the general sheet or we can't resolve the target.
            // For a group sheet, we require a specific target member.
            return false;
          }
        }

        fromUuid(data.uuid as unknown as `Item.${string}`).then((item) => {
          if (item && "system" in item) {
            const item5e = item as unknown as Item5e;
            const itemProxy = item5e as unknown as ProjectItem;
            const projectFlagData = projectData(itemProxy);
            const requirements = projectFlagData.requirements || [];
            const { eligible, reason } = TabLogic.meetsRequirements(
              targetActor as unknown as Actor,
              requirements,
            );

            if (!eligible) {
              return ui.notifications?.warn(`Requirements not met for ${item5e.name}: ${reason}`);
            }

            ProjectEngine.initiateProjectFromItem(
              targetActor as unknown as Actor,
              item5e as unknown as Item,
            );
          }
        });
        return false;
      },
    );

    // @ts-expect-error - tidy5e system hook
    Hooks.once("tidy5e-sheet.ready", (api: Tidy5eApi) => {
      this.registerTidyTabs(api);
    });

    Hooks.on("closeApplication", (app: { id: string }) => {
      if (this.svelteInstances.has(app.id)) {
        unmount(this.svelteInstances.get(app.id)!);
        this.svelteInstances.delete(app.id);
      }
    });
  }

  private static registerTidyTabs(api: Tidy5eApi) {
    api.registerGroupTab(
      new api.models.HtmlTab({
        title: "Group Learning",
        iconClass: "fa-solid fa-book-open-cover",
        tabId: "thefehrs-party-tab",
        html: '<div class="downtime-engine-svelte-root tidy5e-sheet tidy-sheet-body tab-content" style="height: 100%; display: flex; flex-direction: column;"></div>',
        onRender: (params: OnRenderTabParams) => {
          const app = params.app as { id: string; document?: Actor; actor?: Actor };
          const appId = app.id;
          const target = params.tabContentsElement.querySelector(".downtime-engine-svelte-root");
          if (!target) return;

          if (this.svelteInstances.has(appId)) {
            unmount(this.svelteInstances.get(appId)!);
            this.svelteInstances.delete(appId);
          }

          const actor = app.document || app.actor;
          if (!actor) return;

          const partyData = PartyTabLogic.getData(actor as unknown as DowntimeGroupActor);
          const props = {
            ...partyData,
            actor,
          };

          const instance = mount(PartyTab, {
            target: target as HTMLElement,
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
        enabled: (context: { item?: Item5e; document?: Item5e }) => {
          if (!game.user?.isGM) return false;
          const item = context?.item || context?.document;
          if (!item) return false;

          const isLearningType =
            (item.type as string) === "feat" &&
            (item.system as unknown as { type: { value: string } }).type?.value ===
              LearningFeatType;
          const isProject = item.getFlag("thefehrs-learning-manager", "isLearningProject");

          if (isLearningType || isProject) return true;

          const uuid = (item as unknown as { uuid: string }).uuid || "";
          if (uuid.startsWith("Compendium.")) {
            const parts = uuid.split(".");
            const packId = `${parts[1]}.${parts[2]}`;
            return Settings.allowedCompendiums.includes(packId);
          }

          return false;
        },
        onRender: (params: OnRenderTabParams) => {
          const app = params.app as { id: string; document?: Item; actor?: Item };
          const appId = app.id;
          const target = params.element.querySelector(".downtime-engine-svelte-root");
          if (!target) return;

          if (this.svelteInstances.has(appId)) {
            unmount(this.svelteInstances.get(appId)!);
            this.svelteInstances.delete(appId);
          }

          const item = app.document || app.actor;
          if (!item) return;

          const instance = mount(ItemTargetConfig, {
            target: target as HTMLElement,
            props: { item: item as unknown as Item5e },
          });

          this.svelteInstances.set(appId, instance);
        },
      }),
    );

    api.registerItemContent(
      new api.models.HtmlContent({
        html: (data: { document?: Item5e; item?: Item5e }) => {
          const item = data.document || data.item;
          const projectDataFlags = item?.getFlag("thefehrs-learning-manager", "projectData");

          if (!projectDataFlags || !projectDataFlags.target) return "";

          const progress = projectDataFlags.progress || 0;
          const target = projectDataFlags.target;
          const percentage = Math.min(100, Math.max(0, (progress / target) * 100));

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
        },
        injectParams: {
          selector: `section.item-descriptions`,
          position: "beforebegin",
        },
        enabled: (data: { document?: Item5e; item?: Item5e }) => {
          const item = data.document || data.item;
          return !!item?.getFlag("thefehrs-learning-manager", "isLearningProject");
        },
        renderScheme: "handlebars",
      }),
    );
  }
}
