import type { GuidanceTier, SystemRules, TimeUnit } from "../types.js";

export interface SettingsSchema {
  rules: SystemRules;
  timeUnits: TimeUnit[];
  guidanceTiers: GuidanceTier[];
  allowedCompendiums: string[];
  projectTemplates: any[];
  migrationVersion: string;
  autoSpend: boolean;
  autoSpendUnits: string[];
}

export interface SettingMetadata<T> {
  default: T;
  scope: "world" | "user";
  config?: boolean;
}

export const SETTINGS_DEFINITIONS: {
  [K in keyof SettingsSchema]: SettingMetadata<SettingsSchema[K]>;
} = {
  rules: {
    scope: "world",
    default: {
      nonBulkMethod: "roll",
      bulkMethod: "mathematical",
      rollMode: "gmroll",
      notificationLevel: "info",
      checkDC: 12,
      checkFormula: "1d20 + @abilities.int.mod + @tutelage",
      critDoubleStrategy: "any",
      critThreshold: 20,
      bulkExpectedFormula:
        "round(@hours * (22 - max(1, @dc - (@abilities.int.mod + @tutelage))) / 20)",
    },
  },
  timeUnits: {
    scope: "world",
    default: [
      { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
      { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
      { id: "week", name: "Week", short: "w", isBulk: true, ratio: 70 },
    ],
  },
  guidanceTiers: {
    scope: "world",
    default: [
      {
        id: "example_tier",
        name: "Example Tier",
        modifier: 2,
        costs: { hour: 0, day: 0, week: 0 },
        progress: { day: 1, week: 7 },
      },
    ],
  },
  allowedCompendiums: {
    scope: "world",
    default: [],
  },
  projectTemplates: {
    scope: "world",
    default: [],
  },
  migrationVersion: {
    scope: "world",
    default: "2.1.1",
  },
  autoSpend: {
    scope: "user",
    default: false,
  },
  autoSpendUnits: {
    scope: "user",
    default: [],
  },
};

/**
 * Derived default values for all settings.
 */
export const DEFAULT_SETTINGS: SettingsSchema = Object.fromEntries(
  Object.entries(SETTINGS_DEFINITIONS).map(([key, metadata]) => [key, metadata.default]),
) as unknown as SettingsSchema;

export class SettingsManager<Settings extends Record<string, any> = SettingsSchema> {
  static ID = "thefehrs-learning-manager" as const;

  get ID() {
    return SettingsManager.ID;
  }

  private get settings() {
    return game.settings;
  }

  /**
   * Generic getter for a setting.
   */
  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.settings.get(SettingsManager.ID, key as string) as Settings[K];
  }

  /**
   * Generic setter for a setting.
   */
  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    await this.settings.set(SettingsManager.ID, key as string, value);
  }

  /**
   * Register all settings defined in the schema.
   * @param overrides - Optional overrides for registration (e.g., onChange handlers)
   */
  static registerAll(overrides: Partial<Record<keyof SettingsSchema, any>> = {}) {
    for (const [key, metadata] of Object.entries(SETTINGS_DEFINITIONS)) {
      const config = {
        scope: metadata.scope,
        config: metadata.config ?? false,
        type: metadata.default != null ? (metadata.default as any).constructor : Object,
        default: metadata.default,
        ...overrides[key as keyof SettingsSchema],
      };

      // @ts-expect-error - Complex registration data types
      game.settings.register(SettingsManager.ID, key, config);
    }
  }

  // --- Legacy Accessors (kept for backward compatibility, now thin wrappers) ---

  get migrationVersion(): Settings["migrationVersion"] {
    return this.get("migrationVersion" as any);
  }
  get rules(): Settings["rules"] {
    return this.get("rules" as any);
  }
  get timeUnits(): Settings["timeUnits"] {
    const units = this.get("timeUnits" as any);
    console.debug("Downtime Engine | Retrieved Time Units:", units);
    return units;
  }
  get guidanceTiers(): Settings["guidanceTiers"] {
    return this.get("guidanceTiers" as any);
  }
  get allowedCompendiums(): Settings["allowedCompendiums"] {
    return this.get("allowedCompendiums" as any) || [];
  }
  get autoSpend(): Settings["autoSpend"] {
    return this.get("autoSpend" as any);
  }
  get autoSpendUnits(): Settings["autoSpendUnits"] {
    return this.get("autoSpendUnits" as any);
  }

  registerMenu(key: string, data: unknown): void {
    this.settings.registerMenu(SettingsManager.ID, key, data as never);
  }
}

export const Settings = new SettingsManager();
