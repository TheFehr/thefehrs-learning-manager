import type { ActivityData } from "@dnd5e//data/activity/_types.mjs";

export type LearningActivityData = ActivityData & {
  flags: {
    "thefehrs-learning-manager": {
      timeUnitId: string;
      learningTarget: number;
    };
  };
};
