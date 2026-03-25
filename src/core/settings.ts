import type { SystemRules, GuidanceTier, TimeUnit } from "../types.js";

export class Settings {
  static ID = "thefehrs-learning-manager" as const;

  private static get settings() {
    return game.settings;
  }

  static get migrationVersion(): string {
    return this.settings.get(this.ID, "migrationVersion") as any as string;
  }

  static get rules(): SystemRules {
    return this.settings.get(this.ID, "rules") as any as SystemRules;
  }

  static get timeUnits(): TimeUnit[] {
    const units = this.settings.get(this.ID, "timeUnits") as any as TimeUnit[];
    console.debug("Downtime Engine | Retrieved Time Units:", units);
    return units;
  }

  static get guidanceTiers(): GuidanceTier[] {
    return this.settings.get(this.ID, "guidanceTiers") as any as GuidanceTier[];
  }

  static get allowedCompendiums(): string[] {
    return (this.settings.get(this.ID, "allowedCompendiums") as any as string[]) || [];
  }

  static register(key: string, data: unknown): void {
    // @ts-expect-error - Complex registration data types
    this.settings.register(this.ID, key, data as never);
  }

  static registerMenu(key: string, data: unknown): void {
    this.settings.registerMenu(this.ID, key, data as never);
  }

  static async setMigrationVersion(value: string): Promise<void> {
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

  static async setAllowedCompendiums(value: string[]): Promise<void> {
    await this.settings.set(this.ID, "allowedCompendiums", value);
  }

  static async set<K extends string>(key: K, value: unknown): Promise<void> {
    // @ts-expect-error - Bypassing strict key check for generic setter
    await this.settings.set(this.ID, key as never, value);
  }
}
