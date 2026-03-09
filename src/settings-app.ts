import type {
  SystemRules,
  GuidanceTier,
  ProjectTemplate,
  TimeUnit,
  ProjectRequirement,
} from "./types";
import { Settings } from "./settings";
import { ActorProxy } from "./actor-proxy";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LearningConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "learning-config-app",
    tag: "form",
    window: { title: "Downtime Engine Configuration", width: 750, resizable: true },
    position: { height: 600 }, // <-- Changed from "auto" to a fixed pixel height
    actions: {
      addTimeUnit: LearningConfigApp.addTimeUnit,
      deleteTimeUnit: LearningConfigApp.deleteTimeUnit,
      addTier: LearningConfigApp.addTier,
      deleteTier: LearningConfigApp.deleteTier,
      addProject: LearningConfigApp.addProject,
      deleteProject: LearningConfigApp.deleteProject,
      addRequirement: LearningConfigApp.addRequirement,
      deleteRequirement: LearningConfigApp.deleteRequirement,
      exportData: LearningConfigApp.exportData,
      importData: LearningConfigApp.importData,
    },
  };

  static override PARTS = {
    form: { template: "modules/thefehrs-learning-manager/templates/matrix-config.hbs" },
  };

  protected override async _prepareContext(): Promise<any> {
    return {
      rules: Settings.rules,
      timeUnits: Settings.timeUnits,
      tiers: Settings.guidanceTiers,
      projects: Settings.projectTemplates,
      choices: {
        direct: "1 Base Unit = 1 Progress",
        roll: "Learning Check",
      },
      rewardTypes: {
        item: "Item",
        effect: "Effect",
      },
      operatorChoices: {
        "===": "Equals",
        "!==": "Not Equals",
        ">": "Greater Than",
        ">=": "Greater or Equal",
        "<": "Less Than",
        "<=": "Less or Equal",
        includes: "Contains (Text/Array)",
      },
    };
  }

  // --- THE SILENT AUTOSAVE ---
  // This catches the 'blur' event when you click away from an input,
  // saves it, and PREVENTS Foundry from wiping the value.
  protected override async _onChangeForm(formConfig: any, event: Event) {
    await this.saveFormData();
  }

  private async saveFormData() {
    if (!(this.element instanceof HTMLFormElement)) return;
    const formData = new FormData(this.element);
    const data = foundry.utils.expandObject(Object.fromEntries(formData)) as any;

    if (data.rules) await Settings.setRules(data.rules as SystemRules);

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

    const projArray = Object.values(data.projects || {}).map((p: any) => {
      const requirements = Object.values(p.requirements || {}).map((r: any) => ({
        id: r.id,
        attribute: r.attribute || "",
        operator: r.operator || "===",
        value: r.value || "",
      })) as ProjectRequirement[];

      return {
        ...p,
        target: Number(p.target) || 100,
        rewardType: p.rewardType || "item",
        requirements,
      };
    }) as ProjectTemplate[];

    await Settings.setProjectTemplates(projArray);
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

  static async addProject(this: LearningConfigApp) {
    await this.saveFormData();
    const projects = Settings.projectTemplates;
    projects.push({
      id: foundry.utils.randomID(),
      name: "New Project",
      target: 100,
      rewardUuid: "",
      rewardType: "item",
      requirements: [],
    });
    await Settings.setProjectTemplates(projects);
    this.render();
  }

  static async deleteProject(this: LearningConfigApp, event: Event, target: HTMLElement) {
    await this.saveFormData();
    const id = target.dataset.id;

    const isProjectInUse = game.actors?.some((actor: any) => {
      const proxy = ActorProxy.forActor(actor);
      return proxy.projects.some((p: any) => p.templateId === id);
    });

    if (isProjectInUse) {
      ui.notifications.warn(
        "Cannot delete project: One or more characters are currently actively learning it.",
      );
      return;
    }

    const projects = Settings.projectTemplates.filter((p) => p.id !== id);
    await Settings.setProjectTemplates(projects);
    this.render();
  }

  static async addRequirement(this: LearningConfigApp, event: Event, target: HTMLElement) {
    await this.saveFormData();
    const projectId = target.dataset.projectId;
    const projects = Settings.projectTemplates;
    const proj = projects.find((p) => p.id === projectId);
    if (proj) {
      if (!proj.requirements) proj.requirements = [];
      proj.requirements.push({
        id: foundry.utils.randomID(),
        attribute: "",
        operator: "===",
        value: "",
      });
      await Settings.setProjectTemplates(projects);
      this.render();
    }
  }

  static async deleteRequirement(this: LearningConfigApp, event: Event, target: HTMLElement) {
    await this.saveFormData();
    const projectId = target.dataset.projectId;
    const reqId = target.dataset.reqId;
    const projects = Settings.projectTemplates;
    const proj = projects.find((p) => p.id === projectId);
    if (proj && proj.requirements) {
      proj.requirements = proj.requirements.filter((r) => r.id !== reqId);
      await Settings.setProjectTemplates(projects);
      this.render();
    }
  }

  static exportData() {
    const data = {
      rules: Settings.rules,
      timeUnits: Settings.timeUnits,
      tiers: Settings.guidanceTiers,
      projects: Settings.projectTemplates,
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
          if (data.projects) await Settings.setProjectTemplates(data.projects as ProjectTemplate[]);

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
