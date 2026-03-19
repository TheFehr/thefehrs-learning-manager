import type { SystemRules, GuidanceTier, TimeUnit } from "./types";
import { Settings } from "./settings";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LearningConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "learning-config-app",
    tag: "form",
    window: { title: "Downtime Engine Configuration", width: 750, resizable: true },
    position: { height: 600 },
    actions: {
      addTimeUnit: LearningConfigApp.addTimeUnit,
      deleteTimeUnit: LearningConfigApp.deleteTimeUnit,
      addTier: LearningConfigApp.addTier,
      deleteTier: LearningConfigApp.deleteTier,
      exportData: LearningConfigApp.exportData,
      importData: LearningConfigApp.importData,
    },
  };

  static override PARTS = {
    form: { template: "modules/thefehrs-learning-manager/templates/matrix-config.hbs" },
  };

  protected override async _prepareContext(): Promise<any> {
    const compendiums = (game.packs as any)
      .filter((p: any) => p.metadata.type === "Item")
      .map((p: any) => ({
        key: p.metadata.id,
        label: `${p.metadata.label} [${p.metadata.id}]`,
      }));

    return {
      rules: Settings.rules,
      timeUnits: Settings.timeUnits,
      tiers: Settings.guidanceTiers,
      allowedCompendiums: Settings.allowedCompendiums,
      compendiums,
      choices: {
        direct: "1 Base Unit = 1 Progress",
        roll: "Learning Check",
      },
      critStrategies: {
        any: "Double if any die >= threshold",
        all: "Double if all dice >= threshold",
        never: "Never double",
      },
    };
  }

  protected override async _onChangeForm(formConfig: any, event: Event) {
    await this.saveFormData();
  }

  private async saveFormData() {
    if (!(this.element instanceof HTMLFormElement)) return;
    const formData = new FormData(this.element);
    const data = foundry.utils.expandObject(Object.fromEntries(formData)) as any;

    if (data.rules) await Settings.setRules(data.rules as SystemRules);

    const allowedCompendiums = Object.values(data.allowedCompendiums || {}).filter(
      (v) => !!v,
    ) as string[];
    await Settings.setAllowedCompendiums(allowedCompendiums);

    const tuArray = Object.values(data.timeUnits || {}).map((tu: any) => ({
      ...tu,
      isBulk: !!tu.isBulk,
      ratio: Number(tu.ratio) || 1,
    })) as TimeUnit[];
    await Settings.setTimeUnits(tuArray);

    const tiersArray = Object.values(data.tiers || {}).map((t: any) => {
      const costs: Record<string, number> = {};
      const progress: Record<string, number> = {};
      if (t.costs) {
        for (const [k, v] of Object.entries(t.costs)) {
          costs[k] = Number(v) || 0;
        }
      }
      if (t.progress) {
        for (const [k, v] of Object.entries(t.progress)) {
          progress[k] = Number(v) || 0;
        }
      }
      return {
        id: t.id,
        name: t.name || "",
        modifier: Number(t.modifier) || 0,
        costs,
        progress,
      };
    }) as GuidanceTier[];
    await Settings.setGuidanceTiers(tiersArray);
  }

  static async addTimeUnit(this: LearningConfigApp) {
    await this.saveFormData();
    const tu = Settings.timeUnits;
    tu.push({
      id: foundry.utils.randomID(),
      name: "New Unit",
      short: "u",
      isBulk: false,
      ratio: 1,
    });
    await Settings.setTimeUnits(tu);
    this.render();
  }

  static async deleteTimeUnit(this: LearningConfigApp, event: Event, target: HTMLElement) {
    await this.saveFormData();
    const id = target.dataset.id;
    const tu = Settings.timeUnits.filter((t) => t.id !== id);
    await Settings.setTimeUnits(tu);
    this.render();
  }

  static async addTier(this: LearningConfigApp) {
    await this.saveFormData();
    const tiers = Settings.guidanceTiers;
    tiers.push({
      id: foundry.utils.randomID(),
      name: "New Tier",
      modifier: 0,
      costs: {},
      progress: {},
    });
    await Settings.setGuidanceTiers(tiers);
    this.render();
  }

  static async deleteTier(this: LearningConfigApp, event: Event, target: HTMLElement) {
    await this.saveFormData();
    const id = target.dataset.id;
    const tiers = Settings.guidanceTiers.filter((t) => t.id !== id);
    await Settings.setGuidanceTiers(tiers);
    this.render();
  }

  static exportData() {
    const data = {
      rules: Settings.rules,
      timeUnits: Settings.timeUnits,
      tiers: Settings.guidanceTiers,
      allowedCompendiums: Settings.allowedCompendiums,
    };
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", "downtime-engine-settings.json");
  }

  static importData(this: LearningConfigApp) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event: any) => {
        try {
          const data = JSON.parse(event.target.result);
          if (typeof data !== "object") throw new Error("Invalid format");

          if (data.rules) await Settings.setRules(data.rules as SystemRules);
          if (data.timeUnits) await Settings.setTimeUnits(data.timeUnits as TimeUnit[]);
          if (data.tiers) await Settings.setGuidanceTiers(data.tiers as GuidanceTier[]);
          if (data.allowedCompendiums)
            await Settings.setAllowedCompendiums(data.allowedCompendiums as string[]);

          ui.notifications.info("Settings Imported!");
          this.render();
        } catch (err) {
          ui.notifications.error("Failed to import settings: " + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
}
