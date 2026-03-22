import type { FeatItemSystemData } from "@dnd5e/data/item/_types.mjs";
import type { LearningActor, Item5e, ActivityData5e } from "./types.js";

export const LearningFeatType = "learning-project" as const;

export type ComparisonOperator = "===" | "!==" | ">" | ">=" | "<" | "<=" | "includes";

export interface ProjectRequirement {
  id: string;
  attribute: string;
  operator: ComparisonOperator;
  value: string;
}

export type ProjectFlagData = {
  isLearningProject?: boolean;
  isLearnedReward?: boolean;
  isCompleted?: boolean;
  tutelageId?: string;
  progress: number;
  target: number;
  requirements?: ProjectRequirement[];
  stashedType?: string;
  stashedEffects?: unknown[];
  stashedActivities?: object;
};

export const ProjectItem = {
  ID: "thefehrs-learning-manager" as const,
};

export interface LearningActivityData extends Omit<ActivityData5e, "flags"> {
  flags: ActivityData5e["flags"] & {
    "thefehrs-learning-manager": {
      isLearningActivity: true;
      timeUnitId: string;
    };
  };

  item: ProjectItem;
}

export interface LearningFeatItemData extends Omit<FeatItemSystemData, "activities"> {
  activities: Record<string, LearningActivityData>;
}

export interface ProjectItem extends Omit<Item5e, "system" | "actor"> {
  system: LearningFeatItemData;
  actor: LearningActor | null;

  getFlag(scope: "thefehrs-learning-manager", key: "projectData"): ProjectFlagData;
  getFlag<T>(scope: string, key: string): T;
}

export function projectData(item: ProjectItem): ProjectFlagData {
  return item.getFlag("thefehrs-learning-manager", "projectData");
}
