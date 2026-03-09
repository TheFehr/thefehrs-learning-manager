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
    "thefehrs-learning-manager.projectTemplates": ProjectTemplate[];
    "thefehrs-learning-manager.migrationVersion": number;
  }

  interface HookConfig {
    "tidy5e-sheet.ready": [api: Tidy5eApi];
  }

  interface FlagConfig {
    Actor: {
      "thefehrs-learning-manager": {
        bank: TimeBank;
        projects: LearningProject[];
      };
    };
  }
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
    document?: Actor;
    actor?: Actor;
  };

  /** The standard DOM element wrapper for the rendered tab content */
  element: HTMLElement;

  /** The resolved data object returned by your getData function */
  data: unknown;
}

export interface Tidy5eHandlebarsTabOptions {
  title: string;
  tabId: string;
  path: string;
  iconClass?: string;
  getData?: (data: Tidy5eTabGetDataParams) => Promise<unknown> | unknown;
  onRender?: (params: Tidy5eTabRenderParams) => void;
}

// Represents the instantiated tab object created by new api.models.HandlebarsTab()
export interface Tidy5eRegisteredTab {
  tabId: string;
  // ... internal Tidy properties, strictly opaque to us
}

export interface Tidy5eApi {
  registerCharacterTab: (tab: Tidy5eRegisteredTab) => void;
  registerGroupTab: (tab: Tidy5eRegisteredTab) => void;
  models: {
    HandlebarsTab: new (options: Tidy5eHandlebarsTabOptions) => Tidy5eRegisteredTab;
  };
}
