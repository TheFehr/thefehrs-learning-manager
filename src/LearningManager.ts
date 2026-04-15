import type {
  Tidy5eApi,
  DowntimeGroupActor,
  OnRenderTabParams,
  OnRenderParams,
  Item5e,
} from "./types.js";
import { ProjectEngine } from "./logic/project-engine.js";
import { TutelageResolverService } from "./logic/tutelage-resolver.js";
import { Settings, SettingsManager } from "./core/settings.js";
import { LearningConfigApp } from "./apps/settings-app.js";
import { ProjectOverviewApp } from "./apps/overview-app.js";
import { TabLogic } from "./logic/tab-logic.js";
import { projectData, LearningFeatType, LearningActivityData } from "./logic/project-item.js";
import { mount, unmount } from "svelte";
import PartyTab from "./apps/tabs/PartyTab.svelte";
import { PartyTab as PartyTabLogic } from "./apps/party-tab.js";
import ItemLearningConfig from "./apps/tabs/ItemLearningConfig.svelte";
import ActorTutelageConfig from "./apps/tabs/ActorTutelageConfig.svelte";
import TimeBankBar from "./apps/components/TimeBankBar.svelte";
import { Socket } from "./core/socket.js";
import { migrateData } from "./migrations/migration.js";
import { registerMigrationSettings } from "./migrations/migration-registration.js";
import { initDebugHelpers } from "./core/debug.js";
import { Logger } from "./core/logger.js";
import { getGame, getUI } from "./core/foundry.js";

export class LearningManager {
  static ID = "thefehrs-learning-manager" as const;
  static svelteInstances = new Map<string | number, { instance: any; target: HTMLElement }>();
  static socketHandler: ((...args: any[]) => void) | null = null;

  static init() {
    registerMigrationSettings();
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

    Settings.registerMenu("overviewMenu", {
      name: "Project Overview",
      label: "Project Overview",
      hint: "View invalid learning projects",
      icon: "fas fa-eye",
      type: ProjectOverviewApp,
      restricted: true,
    });
  }

  static registerSocketListeners() {
    if (this.socketHandler) {
      Logger.debug("Unregistering existing socket handler.");
      Socket.off(this.socketHandler);
    }

    this.socketHandler =
      Socket.listen(async (message) => {
        if (message.type === "timeGrantedSignal") {
          try {
            await ProjectEngine.handleAutoTrainSignal();
          } catch (err) {
            Logger.error("Failed to handle auto-train signal:", true, err);
          }
        }
      }) || null;
  }

  static async ready() {
    Logger.debug("Initialized");
    try {
      await migrateData();
    } catch (err) {
      Logger.error("Migration failed:", true, err);
    }
  }

  private static registerSettings() {
    SettingsManager.registerAll({
      timeUnits: {
        onChange: async () => {
          try {
            await ProjectEngine.syncAllProjectActivities();
          } catch (err) {
            Logger.error("Failed to sync activities after time unit change:", true, err);
          }
        },
      },
      teacherCompendiums: {
        onChange: () => TutelageResolverService.clearCache(),
      },
      bookCompendiums: {
        onChange: () => TutelageResolverService.clearCache(),
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
      if (item.getFlag(LearningManager.ID, "isLearningProject")) {
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
          Logger.error("Training failed:", true, err);
        });
        return false; // stop standard execution
      }
    });

    Hooks.on(
      "dropActorSheetData",
      (actor: Actor, _sheet: unknown, data: any, _event?: DragEvent) => {
        if (!data || data.type !== "Item" || !data.uuid) return true;

        const uuid = data.uuid as string;
        const isCompendium = uuid.startsWith("Compendium.");
        if (!isCompendium) return true;

        const parts = uuid.split(".");
        const packId = `${parts[1]}.${parts[2]}`;
        const allowed = Settings.get("allowedCompendiums");

        if (!allowed.includes(packId)) return true;

        let targetActor = actor;

        if ((targetActor.type as string) === "group") {
          // Use the event from the hook if provided, otherwise fall back to window.event
          const dragEvent = _event || (window as unknown as { event?: DragEvent }).event;
          const target = dragEvent?.target as HTMLElement | undefined;

          const actorRow = target?.closest('[data-tidy-section-key^="actor-"]') as
            | HTMLElement
            | undefined;
          const sidebarEntry = target?.closest("[data-actor-id]") as HTMLElement | undefined;

          const actorId =
            actorRow?.dataset.tidySectionKey?.replace("actor-", "") ||
            sidebarEntry?.dataset.actorId;

          if (actorId) {
            const member = getGame().actors?.get(actorId);
            if (member) targetActor = member;
          } else {
            // If we can't find a specific member via the event target,
            // we might be dropping on the general sheet or we can't resolve the target.
            // For a group sheet, we require a specific target member.
            return false;
          }
        }

        fromUuid(data.uuid as `Item.${string}`)
          .then(async (item) => {
            if (!item || !("system" in item)) {
              return;
            }

            const item5e = item as Item5e;
            const projectFlagData = projectData(item5e);
            const requirements = projectFlagData?.requirements || [];
            const { eligible, reason } = TabLogic.meetsRequirements(targetActor, requirements);

            if (!eligible) {
              getUI()?.notifications?.warn(`Requirements not met for ${item5e.name}: ${reason}`);
              return;
            }

            await ProjectEngine.initiateProjectFromItem(targetActor, item5e);
          })
          .catch((err) => {
            Logger.error(
              `Failed to initiate project for item ${data.uuid} on actor ${targetActor.name}:`,
              true,
              err,
            );
            getUI()?.notifications?.error(
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
      const existing = this.svelteInstances.get(app.id);
      if (existing) {
        unmount(existing.instance);
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
        enabled: (context: { item?: Item; document?: Item }) => {
          if (!getGame().user?.isGM) return false;
          const item = context?.item || context?.document;
          if (!item) return false;

          const isLearningType =
            (item.type as string) === "feat" &&
            (item.system as any).type?.value === LearningFeatType;
          const isProject = item.getFlag("thefehrs-learning-manager", "isLearningProject");
          const hasBookBonus = !!item.getFlag("thefehrs-learning-manager", "learningBookBonus");

          if (isLearningType || isProject || hasBookBonus) return true;

          const uuid = (item as any).uuid || "";
          if (uuid.startsWith("Compendium.")) {
            if (getGame().user?.isGM) return true;
            const parts = uuid.split(".");
            const packId = `${parts[1]}.${parts[2]}`;
            const isAllowed = Settings.get("allowedCompendiums").includes(packId);
            const isBookPack = Settings.get("bookCompendiums").includes(packId);
            return isAllowed || isBookPack;
          }

          return false;
        },
        onRender: (params: OnRenderTabParams) => {
          this.renderSvelte(
            params,
            ".downtime-engine-svelte-root",
            ItemLearningConfig,
            (item: Item) => ({ item }),
          );
        },
      }),
    );

    const instructorTab = new api.models.HtmlTab({
      title: "Tutelage",
      iconClass: "fa-solid fa-chalkboard-user",
      tabId: `${this.ID}-actor-tutelage-config`,
      html: '<div class="downtime-engine-svelte-root" style="height: 100%;"></div>',
      enabled: (context: { actor?: Actor; document?: Actor }) => {
        if (!getGame().user?.isGM) return false;
        const actor = context?.actor || context?.document;
        if (!actor) return false;

        const hasOfferings = !!actor.getFlag(this.ID, "teacherOfferings");
        if (hasOfferings) return true;

        const uuid = (actor as any).uuid || "";
        if (uuid.startsWith("Compendium.")) {
          if (getGame().user?.isGM) return true;
          const parts = uuid.split(".");
          const packId = `${parts[1]}.${parts[2]}`;
          const isTeacherPack = Settings.get("teacherCompendiums").includes(packId);
          return isTeacherPack;
        }

        return false;
      },
      onRender: (params: OnRenderTabParams) => {
        this.renderSvelte(
          params,
          ".downtime-engine-svelte-root",
          ActorTutelageConfig,
          (actor: Actor) => ({ actor }),
        );
      },
    });

    api.registerCharacterTab(instructorTab);
    api.registerNpcTab(instructorTab);

    api.registerCharacterContent(
      new api.models.HtmlContent({
        html: '<div class="downtime-engine-time-bank-bar-root"></div>',
        injectParams: {
          selector: '[data-tab-contents-for="features"]',
          position: "beforeend",
        },
        enabled: (data: { document?: Actor; actor?: Actor }) => {
          const actor = data.document || data.actor;
          return (actor?.type as string) === "character";
        },
        onRender: (params: OnRenderParams) => {
          this.renderSvelte(
            params as OnRenderTabParams,
            ".downtime-engine-time-bank-bar-root",
            TimeBankBar,
            (actor: Actor) => ({ actor }),
            `time-bank-bar-${params.app.id}`,
          );
        },
      }),
    );
  }

  private static renderSvelte<DocType>(
    params: {
      app: { id: string; document?: unknown; actor?: unknown };
      element?: HTMLElement;
      tabContentsElement?: HTMLElement;
    },
    selector: string,
    Component: Parameters<typeof mount>[0],
    getProps: (doc: DocType) => Record<string, unknown>,
    customAppId?: string,
  ) {
    const appId = customAppId || params.app.id;
    const target = (params.tabContentsElement || params.element)?.querySelector(
      selector,
    ) as HTMLElement;
    if (!target) return;

    const existing = this.svelteInstances.get(appId);
    if (existing) {
      if (existing.target === target) {
        // Already mounted on this target, don't remount
        return;
      }
      unmount(existing.instance);
      this.svelteInstances.delete(appId);
    }

    const doc = (params.app.document || params.app.actor) as DocType;
    if (!doc) return;

    const instance = mount(Component, {
      target,
      props: getProps(doc),
    });

    this.svelteInstances.set(appId, { instance, target });
  }
}
