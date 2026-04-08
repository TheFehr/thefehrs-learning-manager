import type { GuidanceTier, ProjectRequirement, SystemRules, TimeUnit } from "../types.js";

export interface ProjectTemplate {
  id: string;
  name: string;
  target: number;
  description?: string;
  rewardUuid: string;
  rewardType: string;
  requirements: ProjectRequirement[];
}

export interface SettingsSchema {
  rules: SystemRules;
  timeUnits: TimeUnit[];
  guidanceTiers: GuidanceTier[];
  allowedCompendiums: string[];
  projectTemplates: ProjectTemplate[];
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
export const DEFAULT_SETTINGS: SettingsSchema = (
  Object.keys(SETTINGS_DEFINITIONS) as Array<keyof SettingsSchema>
).reduce((acc, key) => {
  (acc as any)[key] = SETTINGS_DEFINITIONS[key].default;
  return acc;
}, {} as Partial<SettingsSchema>) as SettingsSchema;

export interface SettingMenuConfig {
  name: string;
  label: string;
  hint?: string;
  icon?: string;
  type: typeof foundry.applications.api.ApplicationV2 | any;
  restricted: boolean;
}

export class SettingsManager<Settings extends Record<string, any> = SettingsSchema> {
  static readonly ID = "thefehrs-learning-manager" as const;

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
      const defaultValue = metadata.default;
      let type: any = Object;

      if (defaultValue !== null && defaultValue !== undefined) {
        if (Array.isArray(defaultValue)) {
          type = Object;
        } else {
          const t = typeof defaultValue;
          if (t === "boolean") type = Boolean;
          else if (t === "string") type = String;
          else if (t === "number") type = Number;
          else type = Object;
        }
      }

      const safeOverrides: any = {};
      const providedOverrides = overrides[key as keyof SettingsSchema] || {};

      // Whitelist only safe override properties
      const SAFE_PROPS = ["onChange", "requiresReload", "hint", "choices", "name", "config"];
      for (const prop of SAFE_PROPS) {
        if (providedOverrides[prop] !== undefined) {
          safeOverrides[prop] = providedOverrides[prop];
        }
      }

      const config = {
        scope: metadata.scope,
        config: metadata.config ?? false,
        type,
        default: defaultValue,
        ...safeOverrides,
      };

      // @ts-expect-error - Complex registration data types
      game.settings.register(SettingsManager.ID, key, config);
    }
  }

  private seenMissing = new Set<string>();

  /**
   * Generic getter for a setting with a fallback value and a debug log if uninitialized.
   */
  private getWithFallback<K extends keyof Settings>(key: K, fallback: Settings[K]): Settings[K] {
    const val = this.get(key);
    if (val === undefined || val === null) {
      const keyStr = key as string;
      if (!this.seenMissing.has(keyStr)) {
        console.debug(`Downtime Engine | Setting '${keyStr}' is uninitialized or null.`);
        this.seenMissing.add(keyStr);
      }
      return fallback;
    }

    // Deep merge objects to backfill missing nested keys (e.g. newly added rules)
    if (
      typeof val === "object" &&
      val !== null &&
      !Array.isArray(val) &&
      typeof fallback === "object" &&
      fallback !== null &&
      !Array.isArray(fallback)
    ) {
      return foundry.utils.mergeObject(fallback, val, { inplace: false }) as Settings[K];
    }

    return val;
  }

  // --- Legacy Accessors (kept for backward compatibility, now thin wrappers) ---

  get migrationVersion(): Settings["migrationVersion"] {
    return this.getWithFallback("migrationVersion", DEFAULT_SETTINGS.migrationVersion);
  }
  get rules(): Settings["rules"] {
    return this.getWithFallback("rules", DEFAULT_SETTINGS.rules);
  }
  get timeUnits(): Settings["timeUnits"] {
    return this.getWithFallback("timeUnits", DEFAULT_SETTINGS.timeUnits);
  }
  get guidanceTiers(): Settings["guidanceTiers"] {
    return this.getWithFallback("guidanceTiers", DEFAULT_SETTINGS.guidanceTiers);
  }
  get allowedCompendiums(): Settings["allowedCompendiums"] {
    return this.getWithFallback("allowedCompendiums", DEFAULT_SETTINGS.allowedCompendiums);
  }
  get projectTemplates(): Settings["projectTemplates"] {
    return this.getWithFallback("projectTemplates", DEFAULT_SETTINGS.projectTemplates);
  }
  get autoSpend(): Settings["autoSpend"] {
    return this.getWithFallback("autoSpend", DEFAULT_SETTINGS.autoSpend);
  }
  get autoSpendUnits(): Settings["autoSpendUnits"] {
    return this.getWithFallback("autoSpendUnits", DEFAULT_SETTINGS.autoSpendUnits);
  }

  registerMenu(key: string, data: SettingMenuConfig): void {
    this.settings.registerMenu(SettingsManager.ID, key, data as any);
  }
}

export const Settings = new SettingsManager();
