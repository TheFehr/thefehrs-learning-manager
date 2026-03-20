import type { FeatItemSystemData } from "@dnd5e/data/item/_types.mjs";

import { LearningProject } from "../types";
import { LearningActivityData } from "./learning-activity";

export type LearningFeatItemData = Omit<FeatItemSystemData, "activities"> & {
  activities: {
    [key: string]: LearningActivityData;
  };
  flags: {
    "thefehrs-learning-manager": {
      projectData: LearningProject;
    };
  };

  getFlag(scope: "thefehrs-learning-manager", key: "projectData"): {};
  getFlag(scope: string, key: string): any;
  update(data: any): Promise<Item>;
};

export type ProjectItem = Item & LearningFeatItemData;
// export class ProjectItem {
//   static ID = "thefehrs-learning-manager" as const;
//   static PROJECT_DATA_FLAG = `flags.${ProjectItem.ID}.projectData`;
//   private item: ProjectItemData;
//
//   constructor(item: Item) {
//     this.item = item as unknown as ProjectItemData;
//   }
//
//   get projectData(): LearningProject {
//     return this.item.getFlag(ProjectItem.ID, "projectData") || {} as unknown as LearningProject;
//   }
//
//   async setProjectData(projectData: LearningProject) {
//     await this.item.update({[ProjectItem.PROJECT_DATA_FLAG]: projectData})
//   }
// }
