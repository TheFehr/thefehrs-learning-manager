import type { SystemRules, GuidanceTier, ProjectTemplate, TimeUnit } from "./types";

export class Settings {
  static ID = "thefehrs-learning-manager" as const;

  private static get settings() {
    return game.settings;
  }

  static get migrationVersion(): number {
    return (this.settings.get(this.ID, "migrationVersion") as any) || 0;
  }

  static get rules(): SystemRules {
    return this.settings.get(this.ID, "rules") as any;
  }

  static get timeUnits(): TimeUnit[] {
    return this.settings.get(this.ID, "timeUnits") as any;
  }

  static get guidanceTiers(): GuidanceTier[] {
    return this.settings.get(this.ID, "guidanceTiers") as any;
  }

  static get projectTemplates(): ProjectTemplate[] {
    return this.settings.get(this.ID, "projectTemplates") as any;
  }

  static register<T>(key: string, data: any): void {
    this.settings.register(this.ID, key as any, data);
  }

  static registerMenu(key: string, data: any): void {
    this.settings.registerMenu(this.ID, key as any, data);
  }

  static async setMigrationVersion(value: number): Promise<void> {
    await this.settings.set(this.ID, "migrationVersion", value);
  }

  static async setRules(value: SystemRules): Promise<void> {
    await this.settings.set(this.ID, "rules", value);
  }

  static async setTimeUnits(value: TimeUnit[]): Promise<void> {
    await this.settings.set(this.ID, "timeUnits", value);
  }

  static async setGuidanceTiers(value: GuidanceTier[]): Promise<void> {
    await this.settings.set(this.ID, "guidanceTiers", value);
  }

  static async setProjectTemplates(value: ProjectTemplate[]): Promise<void> {
    await this.settings.set(this.ID, "projectTemplates", value);
  }
}
