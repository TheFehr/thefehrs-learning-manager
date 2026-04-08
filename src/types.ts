import type {
  CharacterActorSystemData,
  NPCActorSystemData,
  GroupActorSystemData,
  VehicleActorSystemData,
} from "@dnd5e/data/actor/_types.mjs";
import type {
  FeatItemSystemData,
  SpellItemSystemData,
  ConsumableItemSystemData,
  EquipmentItemSystemData,
  ToolItemSystemData,
  WeaponItemSystemData,
  LootItemSystemData,
  ClassItemSystemData,
  SubclassItemSystemData,
  RaceItemSystemData,
  FacilityItemSystemData,
  ContainerItemSystemData,
} from "@dnd5e/data/item/_types.mjs";
import type {
  ActivationData,
  DurationData,
  RangeData,
  TargetData,
  UsesData,
} from "@dnd5e/data/shared/_types.mjs";
import type { ActivityData } from "@dnd5e/data/activity/_types.mjs";
import type { Tidy5eSheetsApi } from "@tidy5e/api/Tidy5eSheetsApi.js";
import type { ProjectFlagData, ProjectRequirement, ComparisonOperator } from "./project-item.js";

// --- System Unions ---
export type ActorSystem5e =
  | CharacterActorSystemData
  | NPCActorSystemData
  | GroupActorSystemData
  | VehicleActorSystemData;
export type ItemSystem5e = (
  | FeatItemSystemData
  | SpellItemSystemData
  | ConsumableItemSystemData
  | EquipmentItemSystemData
  | ToolItemSystemData
  | WeaponItemSystemData
  | LootItemSystemData
  | ClassItemSystemData
  | SubclassItemSystemData
  | RaceItemSystemData
  | FacilityItemSystemData
  | ContainerItemSystemData
) & {
  activities?: Record<string, any>;
  description?: { value: string; [key: string]: any };
};

// --- Augmented Documents ---

// Import the official ModuleSubType if possible, or use a looser base
export type Actor5e = Omit<Actor, "system"> & {
  system: ActorSystem5e;
};

export type Item5e = Omit<Item, "system"> & {
  system: ItemSystem5e;
};

/** Augmented shared dnd5e types to include missing fields like 'override' */
export type ActivationData5e = ActivationData & { override?: boolean };
export type DurationData5e = DurationData & { override?: boolean; concentration?: boolean };
export type RangeData5e = RangeData & { override?: boolean };
export type TargetData5e = TargetData & { override?: boolean; prompt?: boolean };
export type ConsumptionData5e = {
  value: string;
  scaling: { allowed: boolean; max: string };
  spellSlot: boolean;
  targets: any[];
};

/** Augmented ActivityData to allow null in visibility levels (standard dnd5e behavior) and use augmented shared types */
export interface ActivityData5e extends Omit<
  ActivityData,
  "visibility" | "activation" | "duration" | "range" | "target" | "consumption"
> {
  activation: ActivationData5e;
  duration: DurationData5e;
  range: RangeData5e;
  target: TargetData5e;
  consumption: ConsumptionData5e;
  visibility: Omit<ActivityData["visibility"], "level"> & {
    level: {
      min: number | null;
      max: number | null;
    };
  };
}

export interface TimeUnit {
  id: string;
  name: string;
  short: string;
  isBulk: boolean;
  ratio: number;
}

export type NotificationLevel = "none" | "error" | "info" | "debug";

export interface SystemRules {
  nonBulkMethod: "direct" | "roll";
  bulkMethod: "direct" | "mathematical" | "roll";
  rollMode?: string;
  checkDC?: number;
  checkFormula?: string;
  critDoubleStrategy?: "any" | "all" | "never";
  critThreshold?: number;
  bulkExpectedFormula?: string;
  notificationLevel?: NotificationLevel;
}

export interface GuidanceTier {
  id: string;
  name: string;
  modifier: number;
  costs: Record<string, number>;
  progress: Record<string, number>;
  _migratedGpToCp?: boolean;
  _migratedToV2?: boolean;
}

export type RewardType = "item" | "effect";

export interface TimeBank {
  total: number;
}

export type LearningActor = Omit<Actor5e, "system"> & {
  system: CharacterActorSystemData & {
    currency: { gp: number; sp: number; cp: number };
  };
};

export type DowntimeGroupActor = Omit<Actor5e, "system"> & {
  system: GroupActorSystemData;
};

export interface SearchItem {
  id: string;
  uuid: string;
  name: string;
  documentType: string;
  subType: string;
  img: string;
  system: any;
  packageName: string;
  packageId: string;
  folder: string;
  dragData: any;
  journalLink: string;
  script: string;
  tagline: string;
  tooltip: string;
  show(): Promise<void>;
  get(): Promise<Document | Record<string, unknown>>;
}

export interface QuickInsertAPI {
  search: (text: string, filter?: unknown, max?: number) => Promise<SearchItem[]>;
  open: (config: unknown) => Promise<void>;
}

export type LearningProject = ProjectFlagData;

export interface ModuleAPIs {
  "quick-insert"?: QuickInsertAPI;
}

/**
 * Helper to get a module's API in a type-safe way.
 */
export function getModuleAPI<T extends string & keyof ModuleAPIs>(
  id: T,
): ModuleAPIs[T] | undefined {
  if (typeof game === "undefined" || !game.modules) return undefined;
  const module = game.modules.get(id);
  if (!module) return undefined;

  const api = (module as any).api;
  if (!api || typeof api !== "object") return undefined;

  // Basic shape validation to prevent runtime errors if a module changes its API
  const validators: Partial<Record<keyof ModuleAPIs, (api: any) => boolean>> = {
    "quick-insert": (api) => typeof api.search === "function" && typeof api.open === "function",
  };

  const validator = validators[id];
  if (validator && !validator(api)) {
    console.warn(`Downtime Engine | Module API shape mismatch for ${id}. Disabling integration.`);
    return undefined;
  }

  return api as ModuleAPIs[T];
}

export type { ProjectRequirement, ComparisonOperator, ProjectFlagData };

declare global {
  namespace foundry {
    namespace applications {
      namespace api {
        interface ApplicationV2Options {
          id?: string;
          tag?: string;
          window?: {
            title?: string;
            icon?: string;
            controls?: any[];
            resizable?: boolean;
            [key: string]: unknown;
          };
          position?: {
            width?: number;
            height?: number;
            left?: number;
            top?: number;
            [key: string]: unknown;
          };
          [key: string]: unknown;
        }

        class ApplicationV2 {
          constructor(options?: Partial<ApplicationV2Options>);
          static DEFAULT_OPTIONS: Partial<ApplicationV2Options>;
          render(options?: { force?: boolean; [key: string]: any }): Promise<any>;
          element: HTMLElement;
          id: string;
          close(options?: object): Promise<void>;

          protected _renderHTML(context: object, options: any): Promise<string>;
          protected _replaceHTML(result: string, content: HTMLElement, options: any): void;
          protected _onRender(context: object, options: any): Promise<void>;
        }

        interface DialogV2Button {
          action: string;
          label: string;
          icon?: string;
          class?: string;
          default?: boolean;
          callback?: (
            event: PointerEvent | SubmitEvent,
            button: HTMLButtonElement,
            dialog: any, // v12 uses ApplicationV2 instance
          ) => Promise<any>;
        }

        /**
         * v12 Submit Callback receives the result of the button callback or the action string.
         */
        type DialogV2SubmitCallback = (result: any) => Promise<any>;

        interface DialogV2Options {
          window?: {
            title?: string;
            icon?: string;
            controls?: any[];
            [key: string]: unknown;
          };
          content?: string | HTMLElement;
          buttons?: DialogV2Button[];
          submit?: DialogV2SubmitCallback;
          close?: (event: Event, dialog: any) => void;
          rejectClose?: boolean;
          modal?: boolean;
          [key: string]: unknown;
        }

        class DialogV2 extends ApplicationV2 {
          constructor(options: Partial<DialogV2Options>);

          static wait(options: Partial<DialogV2Options>): Promise<any>;
          static confirm(options: Partial<DialogV2Options>): Promise<any>;
          static prompt(options: Partial<DialogV2Options>): Promise<any>;
        }
      }
    }
    namespace utils {
      function randomID(length?: number): string;
      function getProperty<T = unknown>(obj: object, path: string): T;
      function setProperty(obj: object, path: string, value: unknown): boolean;
      function mergeObject<T extends object, U extends object>(
        original: T,
        other: U,
        options?: object,
        _d?: number,
      ): T & U;
      function escapeHTML(str: string): string;
      function deepClone<T>(obj: T): T;
    }
  }

  interface HookConfig {
    "tidy5e-sheet.ready": (api: Tidy5eSheetsApi) => void;
  }

  interface CONFIG {
    DND5E: {
      featureTypes: Record<string, { label: string }>;
    };
    Dice: {
      rollModes: Record<string, string | { label: string }>;
    };
    SpotlightOmnisearch?: {
      prompt: (options: { query: string }) => Promise<{ data?: { uuid: string } } | null>;
    };
    Item: {
      documentClass: any;
    };
  }

  interface SettingConfig {
    "thefehrs-learning-manager.rules": SystemRules;
    "thefehrs-learning-manager.timeUnits": TimeUnit[];
    "thefehrs-learning-manager.guidanceTiers": GuidanceTier[];
    "thefehrs-learning-manager.allowedCompendiums": string[];
    "thefehrs-learning-manager.projectTemplates": unknown[];
    "thefehrs-learning-manager.migrationVersion": string;
    "thefehrs-learning-manager.autoSpend": boolean;
    "thefehrs-learning-manager.autoSpendUnits": string[];
  }

  interface FlagConfig {
    Actor: {
      "thefehrs-learning-manager": {
        projects: LearningProject[];
        bank: TimeBank;
      };
    };
    Item: {
      "thefehrs-learning-manager": {
        projectData: ProjectFlagData;
        isLearningProject?: boolean;
        isLearnedReward?: boolean;
        stashedType?: string;
        stashedEffects?: unknown[];
        stashedActivities?: object;
      };
      "tidy5e-sheet": {
        section?: string;
      };
    };
  }
}

// Re-export dnd5e types with original names if needed
export type {
  ActivationData as Activation,
  DurationData as Duration,
  RangeData as Range,
  TargetData as Target,
  UsesData as Uses,
};

// --- Tidy 5e Sheets API Types ---
export type { Tidy5eSheetsApi as Tidy5eApi };

export interface OnRenderParams {
  app: { id: string; [key: string]: any };
  element: HTMLElement;
  data: any;
  isFullRender: boolean;
}

export interface OnRenderTabParams extends OnRenderParams {
  tabContentsElement: HTMLElement;
}

export type Tidy5eTabRenderParams = OnRenderTabParams;

export interface Tidy5eTabGetDataParams {
  /** * The Foundry VTT Actor instance this sheet belongs to. */
  actor: Actor5e;

  /** Any other contextual data Tidy5e passes down */
  [key: string]: unknown;
}

export type ModuleSubType = string;
