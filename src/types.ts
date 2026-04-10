import type {} from "@league-of-foundry-developers/foundry-vtt-types";

declare global {
  interface LenientGlobalVariableTypes {
    game: Game;
    canvas: Canvas;
    ui: {
      notifications: Notifications;
      [key: string]: any;
    };
    socket: io.Socket;
  }
}
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
} from "@dnd5e/data/shared/_types.mjs";
import type { ActivityData } from "@dnd5e/data/activity/_types.mjs";
import type { Tidy5eSheetsApi } from "@tidy5e/api/Tidy5eSheetsApi.js";
import type {
  ProjectFlagData,
  ProjectRequirement,
  ComparisonOperator,
} from "./logic/project-item.js";

// --- Project Configuration Types ---

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

// --- System Data Unions ---

export type ActorSystem5e =
  | CharacterActorSystemData
  | NPCActorSystemData
  | GroupActorSystemData
  | VehicleActorSystemData;

export type {
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
};

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

// --- Library Augmentation ---

declare module "fvtt-types/configuration" {
  interface AssumeHookRan {
    ready: never;
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
        projects?: ProjectFlagData[];
        bank?: TimeBank;
      };
    };
    Item: {
      "thefehrs-learning-manager": {
        projectData?: ProjectFlagData;
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

declare global {
  interface HookConfig {
    "tidy5e-sheet.ready": (api: Tidy5eSheetsApi) => void;
  }

  interface CONFIG {
    DND5E: {
      featureTypes: Record<string, { label: string }>;
    };
    SpotlightOmnisearch?: {
      prompt: (options: { query: string }) => Promise<{ data?: { uuid: string } } | null>;
    };
  }

  namespace foundry {
    namespace dice {
      type RollMode = ChatMessage.PassableRollMode;
    }
    namespace applications {
      namespace api {
        namespace DialogV2 {
          interface Configuration {
            close?: (event: Event, dialog: any) => void;
          }
        }
      }
    }
  }

  // Augment base documents to ensure displayCard and other custom methods are visible.
  // We use any for the SubType generic to avoid conflicts with the library's strict narrowing.
}
// --- Augmented Document Types ---

/**
 * Augmented Actor type that bypasses the library's strict SubType mapping
 * while providing our system and flag types.
 */
export type Actor5e = Actor<any> & {
  system: ActorSystem5e;
  getRollData(): any;
};

/**
 * Type guard to check if an actor is a valid dnd5e actor with required properties.
 */
export function isActor5e(actor: any): actor is Actor5e {
  return (
    actor &&
    typeof actor === "object" &&
    "system" in actor &&
    typeof (actor as any).getFlag === "function" &&
    typeof (actor as any).getRollData === "function"
  );
}

/**
 * Augmented Item type.
 */
export type Item5e = Item<any> & {
  system: ItemSystem5e;
  displayCard(options?: object): Promise<unknown>;
};

export type LearningActor = Actor5e & {
  system: CharacterActorSystemData & {
    currency: { gp: number; sp: number; cp: number };
  };
};

export type DowntimeGroupActor = Actor5e & {
  system: GroupActorSystemData;
};

export type LearningProject = ProjectFlagData;

// --- Module Integration APIs ---

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

// --- Shared Data Types ---

export type { ProjectRequirement, ComparisonOperator, ProjectFlagData };

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
  actor: Actor;

  /** Any other contextual data Tidy5e passes down */
  [key: string]: unknown;
}

export type ModuleSubType = string;

/** Augmented shared dnd5e types to include missing fields like 'override' */
export type ActivationData5e = ActivationData & { override?: boolean };
export type DurationData5e = DurationData & { override?: boolean; concentration?: boolean };
export type RangeData5e = RangeData & { override?: boolean };
export type TargetData5e = TargetData & { override?: boolean; prompt?: boolean };
export type ConsumptionData5e = ActivityData["consumption"] & {
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
