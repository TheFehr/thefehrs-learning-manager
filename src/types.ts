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
export type ItemSystem5e =
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
  | ContainerItemSystemData;

// --- Augmented Documents ---

// Import the official ModuleSubType if possible, or use a looser base
export type Actor5e = Omit<Actor, "system"> & {
  system: ActorSystem5e;
};

export type Item5e = Omit<Item, "system"> & {
  system: ItemSystem5e;
};

/** Augmented ActivityData to allow null in visibility levels (standard dnd5e behavior) */
export interface ActivityData5e extends Omit<ActivityData, "visibility"> {
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

export interface SystemRules {
  method: "direct" | "roll";
  rollMode?: string;
  checkDC?: number;
  checkFormula?: string;
  critDoubleStrategy?: "any" | "all" | "never";
  critThreshold?: number;
}

export interface GuidanceTier {
  id: string;
  name: string;
  modifier: number;
  costs: Record<string, number>;
  progress: Record<string, number>;
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

export type LearningProject = ProjectFlagData;

export type { ProjectRequirement, ComparisonOperator, ProjectFlagData };

declare global {
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
  }

  interface SettingConfig {
    "thefehrs-learning-manager.rules": SystemRules;
    "thefehrs-learning-manager.timeUnits": TimeUnit[];
    "thefehrs-learning-manager.guidanceTiers": GuidanceTier[];
    "thefehrs-learning-manager.allowedCompendiums": string[];
    "thefehrs-learning-manager.projectTemplates": unknown[];
    "thefehrs-learning-manager.migrationVersion": string;
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
  app: unknown;
  element: HTMLElement;
  data: unknown;
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
