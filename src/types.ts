import { Tidy5eSheetsApi } from "@tidy5e/api";

export interface TimeUnit {
  id: string;
  name: string;
  short: string;
  isBulk: boolean;
  ratio: number;
}

export interface SystemRules {
  method: "direct" | "roll";
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
export type ComparisonOperator = "===" | "!==" | ">" | ">=" | "<" | "<=" | "includes";

export interface ProjectRequirement {
  id: string;
  attribute: string;
  operator: ComparisonOperator;
  value: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  target: number;
  rewardUuid: string;
  rewardType: RewardType;
  requirements: ProjectRequirement[];
}

export interface LearningProject {
  id: string;
  templateId: string;
  progress: number;
  target: number;
  requirements: ProjectRequirement[];
  guidanceTierId: string;
  isCompleted: boolean;
}

export interface TimeBank {
  total: number;
}

export interface DowntimeActor extends Actor {
  system: Actor["system"] & {
    currency: { gp: number; sp: number; cp: number };
  };
}

export interface DowntimeGroupActor extends Actor {
  system: Actor["system"] & { members: any[] };
}

declare global {
  interface SettingConfig {
    "thefehrs-learning-manager.rules": SystemRules;
    "thefehrs-learning-manager.timeUnits": TimeUnit[];
    "thefehrs-learning-manager.guidanceTiers": GuidanceTier[];
    "thefehrs-learning-manager.allowedCompendiums": string[];
    "thefehrs-learning-manager.migrationVersion": string;
  }

  interface HookConfig {
    "tidy5e-sheet.ready": [api: Tidy5eSheetsApi];
  }

  interface FlagConfig {
    Actor: {
      "thefehrs-learning-manager": {
        bank: TimeBank;
        projects: LearningProject[];
      };
    };
    Item: {
      "thefehrs-learning-manager": {
        isLearningProject?: boolean;
        isLearnedReward?: boolean;
        projectData?: LearningProject;
        stashedEffects?: any[];
        stashedActivities?: any[];
        stashedType?: string;
      };
    };
  }
}

// --- DnD 5e Types ---
export interface ItemActivity {
  type: string;
  activation: Activation;
  consumption: Consumption;
  description: Description;
  duration: Duration;
  effects: any[];
  flags: Flags;
  range: Range;
  target: Target;
  uses: Uses;
  visibility: Visibility;
  roll: Roll;
  name: string;
  _id: string;
  sort: number;
}

export interface Activation {
  type: string;
  override: boolean;
  condition: string;
  value: number;
}

export interface Consumption {
  scaling: Scaling;
  spellSlot: boolean;
  targets: any[];
}

export interface Scaling {
  allowed: boolean;
}

export interface Description {
  chatFlavor: string;
}

export interface Duration {
  units: string;
  concentration: boolean;
  override: boolean;
  special: string;
}

export interface Flags {}

export interface Range {
  units: string;
  override: boolean;
  special: string;
}

export interface Target {
  template: Template;
  affects: Affects;
  override: boolean;
  prompt: boolean;
}

export interface Template {
  contiguous: boolean;
  units: string;
  type: string;
}

export interface Affects {
  choice: boolean;
  type: string;
}

export interface Uses {
  spent: number;
  recovery: any[];
  max: string;
}

export interface Visibility {
  level: Level;
  requireAttunement: boolean;
  requireIdentification: boolean;
  requireMagic: boolean;
  identifier: string;
}

export interface Level {
  min: any;
  max: any;
}

export interface Roll {
  prompt: boolean;
  visible: boolean;
  name: string;
  formula: string;
}

// --- Tidy 5e Sheets API Types ---

export interface Tidy5eTabGetDataParams {
  /** * The Foundry VTT Actor instance this sheet belongs to.
   * Provided by the @league-of-foundry-developers/foundry-vtt-types package.
   */
  actor: Actor;

  /** Any other contextual data Tidy5e passes down */
  [key: string]: unknown;
}

export interface Tidy5eTabRenderParams {
  /** * The application instance rendering the sheet.
   * We extend Foundry's base Application to include the specific properties Tidy5e attaches.
   */
  app: Application & {
    id: string;
    document?: Actor;
    actor?: Actor;
  };

  /** The standard DOM element wrapper for the rendered tab content */
  element: HTMLElement;

  /** The resolved data object returned by your getData function */
  data: unknown;
}
