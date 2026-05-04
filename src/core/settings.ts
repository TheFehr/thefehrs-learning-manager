import { Logger } from "./logger.js";
import { FoundryUtils } from "./foundry-utils.js";
import type { ProjectRequirement, SystemRules, TimeUnit } from "@/types.js";
import { DEFAULT_DC, DEFAULT_CATEGORIES, MODULE_ID } from "@/global.js";
import { getGame } from "./foundry.js";

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
  teacherCompendiums: string[];
  bookCompendiums: string[];
  allowedCompendiums: string[];
  projectTemplates: ProjectTemplate[];
  migrationVersion: string;
  autoSpend: boolean;
  autoSpendUnits: string[];
  categories: string[];
  scanWorldActors: boolean;
}

const WORLD_SCOPE = "world" as const;
const USER_SCOPE = "user" as const;

export type SettingScope = typeof WORLD_SCOPE | typeof USER_SCOPE;

export interface SettingMetadata<T> {
  default: T;
  scope: SettingScope;
  config?: boolean;
}

export const SETTINGS_DEFINITIONS: {
  [K in keyof SettingsSchema]: SettingMetadata<SettingsSchema[K]>;
} = {
  rules: {
    scope: WORLD_SCOPE,
    default: {
      nonBulkMethod: "roll",
      bulkMethod: "mathematical",
      rollMode: "gmroll",
      notificationLevel: "info",
      checkDC: DEFAULT_DC,
      checkFormula: "1d20 + @abilities.int.mod + @tutelage",
      critDoubleStrategy: "any",
      critThreshold: 20,
      bulkExpectedFormula:
        "round(@hours * (22 - max(1, @dc - (@abilities.int.mod + @tutelage))) / 20)",
    },
  },
  timeUnits: {
    scope: WORLD_SCOPE,
    default: [
      { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
      { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
      { id: "week", name: "Week", short: "w", isBulk: true, ratio: 70 },
    ],
  },
  teacherCompendiums: {
    scope: WORLD_SCOPE,
    default: [],
  },
  bookCompendiums: {
    scope: WORLD_SCOPE,
    default: [],
  },
  allowedCompendiums: {
    scope: WORLD_SCOPE,
    default: [],
  },
  projectTemplates: {
    scope: WORLD_SCOPE,
    default: [],
  },
  migrationVersion: {
    scope: WORLD_SCOPE,
    default: "3.0.0",
  },
  autoSpend: {
    scope: USER_SCOPE,
    default: false,
  },
  autoSpendUnits: {
    scope: USER_SCOPE,
    default: [],
  },
  categories: {
    scope: WORLD_SCOPE,
    default: [...DEFAULT_CATEGORIES],
  },
  scanWorldActors: {
    scope: WORLD_SCOPE,
    default: true,
  },
};

/**
 * Derived default values for all settings.
 */
export const DEFAULT_SETTINGS: SettingsSchema = Object.fromEntries(
  Object.entries(SETTINGS_DEFINITIONS).map(([key, metadata]) => [key, metadata.default]),
) as unknown as SettingsSchema;

export interface SettingMenuConfig {
  name: string;
  label: string;
  hint?: string;
  icon?: string;
  type: new (...args: any[]) => foundry.applications.api.ApplicationV2<any, any, any>;
  restricted: boolean;
}

export class SettingsManager {
  static readonly ID = MODULE_ID;

  get ID() {
    return SettingsManager.ID;
  }

  /**
   * Generic getter for a setting.
   */
  get<K extends keyof SettingsSchema>(key: K): SettingsSchema[K] {
    return this.getWithFallback(key, DEFAULT_SETTINGS[key]);
  }

  /**
   * Generic setter for a setting.
   */
  async set<K extends keyof SettingsSchema>(key: K, value: SettingsSchema[K]): Promise<void> {
    await getGame().settings.set(SettingsManager.ID, key as any, value);
  }

  /**
   * Register all settings defined in the schema.
   * @param overrides - Optional overrides for registration (e.g., onChange handlers)
   */
  static registerAll(overrides: Partial<Record<keyof SettingsSchema, unknown>> = {}) {
    for (const [key, metadata] of Object.entries(SETTINGS_DEFINITIONS)) {
      const defaultValue = metadata.default;
      let type: unknown = Object;

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

      const safeOverrides: Record<string, unknown> = {};
      const providedOverrides = (overrides[key as keyof SettingsSchema] || {}) as Record<
        string,
        unknown
      >;

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
        type: type as foundry.helpers.ClientSettings.Type,
        default: defaultValue,
        ...safeOverrides,
      };

      getGame().settings.register(SettingsManager.ID, key as any, config as any);
    }
  }

  private seenMissing = new Set<string>();

  /**
   * Internal getter that fetches from game.settings and merges defaults if necessary.
   */
  private getWithFallback<K extends keyof SettingsSchema>(
    key: K,
    fallback: SettingsSchema[K],
  ): SettingsSchema[K] {
    const val = getGame().settings.get(SettingsManager.ID, key as any) as SettingsSchema[K];
    if (val === undefined || val === null) {
      const keyStr = key as string;
      if (!this.seenMissing.has(keyStr)) {
        Logger.debug(`Setting '${keyStr}' is uninitialized or null.`);
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
      return FoundryUtils.mergeObject(fallback, val, {
        inplace: false,
      }) as SettingsSchema[K];
    }

    return val;
  }

  registerMenu(key: string, data: SettingMenuConfig): void {
    getGame().settings.registerMenu(SettingsManager.ID, key as any, data as any);
  }
}

export const Settings = new SettingsManager();
