import type { Tidy5eApi, DowntimeGroupActor, OnRenderTabParams, Actor5e, Item5e } from "./types.js";
import { ProjectEngine } from "./project-engine.js";
import { Settings, SettingsManager } from "./core/settings.js";
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
import TimeBankBar from "./apps/components/TimeBankBar.svelte";
import { Socket } from "./core/socket";
import { migrateData } from "./migrations/migration";
import { initDebugHelpers } from "./core/debug.js";

export class LearningManager {
  static ID = "thefehrs-learning-manager" as const;
  static svelteInstances = new Map<string | number, Record<string, unknown>>();

  static init() {
    this.registerSettings();
    this.registerConfigExpansions();
    this.registerHooks();
    this.registerSocketListeners();
    initDebugHelpers();

    Settings.registerMenu("configMenu", {
      name: "Downtime Engine Config",
      label: "Open Settings Panel",
      hint: "Configure the Downtime Engine",
      icon: "fas fa-cogs",
      type: LearningConfigApp,
      restricted: false,
    });
  }

  static registerSocketListeners() {
    Socket.listen(async (message) => {
      if (message.type === "timeGrantedSignal") {
        try {
          await ProjectEngine.handleAutoTrainSignal();
        } catch (err) {
          console.error("Downtime Engine | Failed to handle auto-train signal:", err);
        }
      }
    });
  }

  static async ready() {
    console.debug("Downtime Engine | Initialized");
    try {
      await migrateData();
    } catch (err) {
      console.error("Downtime Engine | Migration failed:", err);
    }
  }

  private static registerSettings() {
    SettingsManager.registerAll({
      timeUnits: {
        onChange: async () => {
          try {
            await ProjectEngine.syncAllProjectActivities();
          } catch (err) {
            console.error(
              "Downtime Engine | Failed to sync activities after time unit change:",
              err,
            );
          }
        },
      },
    });
  }

  private static registerConfigExpansions() {
    CONFIG.DND5E.featureTypes[LearningFeatType] = {
      label: "In-Progress Learning",
    };
  }

  private static registerHooks() {
    // @ts-expect-error - dnd5e system hook
    Hooks.on("dnd5e.preUseItem", (item: Item5e, config: { createMessage?: boolean }) => {
      if (item.getFlag("thefehrs-learning-manager", "isLearningProject")) {
        if (config) {
          config.createMessage = false;
        }
      }
    });

    // @ts-expect-error - dnd5e system hook
    Hooks.on("dnd5e.preUseActivity", (activity: LearningActivityData) => {
      // Check if this is a learning activity
      if (activity.flags?.[LearningManager.ID]?.isLearningActivity) {
        // We handle the training async but must return false synchronously to stop dnd5e's default use flow
        ProjectEngine.processTraining(activity).catch((err) => {
          console.error("Downtime Engine | Training failed:", err);
        });
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

        fromUuid(data.uuid as unknown as `Item.${string}`)
          .then(async (item) => {
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
                ui.notifications?.warn(`Requirements not met for ${item5e.name}: ${reason}`);
                return;
              }

              await ProjectEngine.initiateProjectFromItem(
                targetActor as unknown as Actor,
                item5e as unknown as Item,
              );
            }
          })
          .catch((err) => {
            console.error(
              `Downtime Engine | Failed to initiate project for item ${data.uuid} on actor ${targetActor.name}:`,
              err,
            );
            ui.notifications?.error(
              `Downtime Engine | Failed to initiate project: ${err instanceof Error ? err.message : String(err)}`,
            );
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
          this.renderSvelte(
            params,
            ".downtime-engine-svelte-root",
            PartyTab,
            (actor: DowntimeGroupActor) => {
              const partyData = PartyTabLogic.getData(actor);
              return { ...partyData, actor };
            },
          );
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
          this.renderSvelte(
            params,
            ".downtime-engine-svelte-root",
            ItemTargetConfig,
            (item: Item5e) => ({ item }),
          );
        },
      }),
    );

    api.registerCharacterContent(
      new api.models.HtmlContent({
        html: '<div class="downtime-engine-time-bank-bar-root"></div>',
        injectParams: {
          selector: '[data-tab-contents-for="features"]',
          position: "beforeend",
        },
        enabled: (data: { document?: Actor5e; actor?: Actor5e }) => {
          const actor = data.document || data.actor;
          return actor?.type === "character";
        },
        onRender: (params: OnRenderTabParams) => {
          this.renderSvelte(
            params,
            ".downtime-engine-time-bank-bar-root",
            TimeBankBar,
            (actor: Actor5e) => ({ actor }),
            `time-bank-bar-${params.app.id}`,
          );
        },
      }),
    );
  }

  private static renderSvelte(
    params: {
      app: { id: string; document?: unknown; actor?: unknown };
      element?: HTMLElement;
      tabContentsElement?: HTMLElement;
    },
    selector: string,
    Component: Parameters<typeof mount>[0],
    getProps: (doc: any) => Record<string, unknown>,
    customAppId?: string,
  ) {
    const appId = customAppId || params.app.id;
    const target = (params.tabContentsElement || params.element)?.querySelector(selector);
    if (!target) return;

    if (this.svelteInstances.has(appId)) {
      unmount(this.svelteInstances.get(appId)!);
      this.svelteInstances.delete(appId);
    }

    const doc = params.app.document || params.app.actor;
    if (!doc) return;

    const instance = mount(Component, {
      target: target as HTMLElement,
      props: getProps(doc),
    });

    this.svelteInstances.set(appId, instance);
  }
}
