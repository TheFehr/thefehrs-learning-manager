// @ts-nocheck
import type { SystemRules, GuidanceTier, ProjectTemplate, TimeUnit } from './types';

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
            exportData: LearningConfigApp.exportData,
            importData: LearningConfigApp.importData
        }
    };

    static override PARTS = {
        form: { template: "modules/thefehrs-learning-manager/templates/matrix-config.hbs" }
    };

    protected override async _prepareContext() {
        return {
            rules: game.settings.get('thefehrs-learning-manager', "rules"),
            timeUnits: game.settings.get('thefehrs-learning-manager', "timeUnits"),
            tiers: game.settings.get('thefehrs-learning-manager', "guidanceTiers"),
            projects: game.settings.get('thefehrs-learning-manager', "projectTemplates")
        };
    }

    // --- THE SILENT AUTOSAVE ---
    // This catches the 'blur' event when you click away from an input,
    // saves it, and PREVENTS Foundry from wiping the value.
    protected override async _onChangeForm(formConfig: any, event: Event) {
        await this.saveFormData();
    }

    private async saveFormData() {
        const form = this.element; 
        const formData = new FormData(form);
        const data = foundry.utils.expandObject(Object.fromEntries(formData));
        
        if (data.rules) await game.settings.set('thefehrs-learning-manager', "rules", data.rules);
        
        const tuArray = Object.values(data.timeUnits || {}).map((tu: any) => ({
            ...tu, isBulk: !!tu.isBulk, ratio: Number(tu.ratio) || 1
        }));
        await game.settings.set('thefehrs-learning-manager', "timeUnits", tuArray);

        const tiersArray = Object.values(data.tiers || {}).map((t: any) => {
            const costs: Record<string, number> = {};
            const progress: Record<string, number> = {};
            if (t.costs) for (const [k, v] of Object.entries(t.costs)) costs[k] = Number(v) || 0;
            if (t.progress) for (const [k, v] of Object.entries(t.progress)) progress[k] = Number(v) || 0;
            return { ...t, modifier: Number(t.modifier) || 0, costs, progress, id: t.id };
        });
        await game.settings.set('thefehrs-learning-manager', "guidanceTiers", tiersArray);

        const projArray = Object.values(data.projects || {}).map((p:any) => ({
            ...p, target: Number(p.target) || 100
        }));
        await game.settings.set('thefehrs-learning-manager', "projectTemplates", projArray);
    }

    static async addTimeUnit(this: LearningConfigApp) {
        await this.saveFormData();
        const tu = game.settings.get('thefehrs-learning-manager', "timeUnits") as TimeUnit[];
        tu.push({ id: foundry.utils.randomID(), name: "New Unit", short: "u", isBulk: false, ratio: 1 });
        await game.settings.set('thefehrs-learning-manager', "timeUnits", tu);
        this.render();
    }

    static async deleteTimeUnit(this: LearningConfigApp, event: Event, target: HTMLElement) {
        await this.saveFormData();
        const id = target.dataset.id;
        const tu = (game.settings.get('thefehrs-learning-manager', "timeUnits") as TimeUnit[]).filter(t => t.id !== id);
        await game.settings.set('thefehrs-learning-manager', "timeUnits", tu);
        this.render();
    }

    static async addTier(this: LearningConfigApp) {
        await this.saveFormData();
        const tiers = game.settings.get('thefehrs-learning-manager', "guidanceTiers") as GuidanceTier[];
        tiers.push({ id: foundry.utils.randomID(), name: "New Tier", modifier: 0, costs: {}, progress: {} });
        await game.settings.set('thefehrs-learning-manager', "guidanceTiers", tiers);
        this.render();
    }

    static async deleteTier(this: LearningConfigApp, event: Event, target: HTMLElement) {
        await this.saveFormData();
        const id = target.dataset.id;
        const tiers = (game.settings.get('thefehrs-learning-manager', "guidanceTiers") as GuidanceTier[]).filter(t => t.id !== id);
        await game.settings.set('thefehrs-learning-manager', "guidanceTiers", tiers);
        this.render();
    }

    static async addProject(this: LearningConfigApp) {
        await this.saveFormData();
        const projects = game.settings.get('thefehrs-learning-manager', "projectTemplates") as ProjectTemplate[];
        projects.push({ id: foundry.utils.randomID(), name: "New Project", target: 100, rewardUuid: "" });
        await game.settings.set('thefehrs-learning-manager', "projectTemplates", projects);
        this.render();
    }

    static async deleteProject(this: LearningConfigApp, event: Event, target: HTMLElement) {
        await this.saveFormData();
        const id = target.dataset.id;
        const projects = (game.settings.get('thefehrs-learning-manager', "projectTemplates") as ProjectTemplate[]).filter(p => p.id !== id);
        await game.settings.set('thefehrs-learning-manager', "projectTemplates", projects);
        this.render();
    }

    static exportData() {
        const data = {
            rules: game.settings.get('thefehrs-learning-manager', "rules"),
            timeUnits: game.settings.get('thefehrs-learning-manager', "timeUnits"),
            tiers: game.settings.get('thefehrs-learning-manager', "guidanceTiers"),
            projects: game.settings.get('thefehrs-learning-manager', "projectTemplates")
        };
        saveDataToFile(JSON.stringify(data, null, 2), "text/json", "downtime-engine-settings.json");
    }

    static importData(this: LearningConfigApp) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = async (event: any) => {
                const data = JSON.parse(event.target.result);
                if (data.rules) await game.settings.set('thefehrs-learning-manager', "rules", data.rules);
                if (data.timeUnits) await game.settings.set('thefehrs-learning-manager', "timeUnits", data.timeUnits);
                if (data.tiers) await game.settings.set('thefehrs-learning-manager', "guidanceTiers", data.tiers);
                if (data.projects) await game.settings.set('thefehrs-learning-manager', "projectTemplates", data.projects);
                ui.notifications.info("Settings Imported!");
                this.render();
            };
            reader.readAsText(file);
        };
        input.click();
    }
}
