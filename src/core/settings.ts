import type { SystemRules, GuidanceTier, TimeUnit } from "../types.js";

export class Settings {
  static ID = "thefehrs-learning-manager" as const;

  private static get settings() {
    return game.settings;
  }

  static get migrationVersion(): string {
    // @ts-expect-error - Foundry settings return type is not perfectly matching augmentation
    return this.settings.get(this.ID, "migrationVersion");
  }

  static get rules(): SystemRules {
    // @ts-expect-error - Foundry settings return type is not perfectly matching augmentation
    return this.settings.get(this.ID, "rules");
  }

  static get timeUnits(): TimeUnit[] {
    // @ts-expect-error - Foundry settings return type is not perfectly matching augmentation
    const units = this.settings.get(this.ID, "timeUnits");
    console.debug("Downtime Engine | Retrieved Time Units:", units);
    return units;
  }

  static get guidanceTiers(): GuidanceTier[] {
    // @ts-expect-error - Foundry settings return type is not perfectly matching augmentation
    return this.settings.get(this.ID, "guidanceTiers");
  }

  static get allowedCompendiums(): string[] {
    // @ts-expect-error - Foundry settings return type is not perfectly matching augmentation
    return this.settings.get(this.ID, "allowedCompendiums") || [];
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
