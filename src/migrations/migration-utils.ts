import { ProjectEngine } from "../project-engine.js";
import type { Actor5e, Item5e } from "../types.js";

export interface LegacyProject {
  id?: string;
  name?: string;
  templateId?: string;
  progress?: number;
  maxProgress?: number;
  target?: number;
  rewardUuid?: string;
  rewardType?: string;
  guidanceTierId?: string;
  isCompleted?: boolean;
}

/**
 * Common logic to create a native Item from a project template and data.
 * Used by multiple migration paths.
 */
export async function createProjectItemFromTemplate(
  actor: Actor5e,
  rewardUuid: string,
  projectData: LegacyProject,
  defaultTarget: number = 0,
): Promise<Item | null> {
  const rewardDoc = await fromUuid(rewardUuid as any);
  if (!rewardDoc || !(rewardDoc instanceof Item)) return null;

  const item5e = rewardDoc as unknown as Item5e;
  const itemData = item5e.toObject();
  const stashedEffects = itemData.effects || [];
  const stashedActivities = itemData.system.activities || {};
  const stashedType = itemData.type;

  const projectDataWithTarget = {
    ...projectData,
    target: projectData.target ?? defaultTarget,
  };

  const updateData = {
    ...itemData,
    type: projectData.isCompleted ? stashedType : "feat",
    effects: projectData.isCompleted ? itemData.effects : [],
    "system.type.value": projectData.isCompleted
      ? (itemData.system as unknown as { type: { value: string } }).type?.value
      : "learning-project",
    "system.activities": projectData.isCompleted ? itemData.system.activities : {},
    "flags.thefehrs-learning-manager": {
      isLearningProject: !projectData.isCompleted,
      isLearnedReward: projectData.isCompleted,
      projectData: projectDataWithTarget,
      stashedEffects: stashedEffects,
      stashedActivities: stashedActivities,
      stashedType: stashedType,
    },
    "flags.tidy5e-sheet.section": projectData.isCompleted
      ? "Completed Learning"
      : "In-Progress Learning",
  };

  // @ts-expect-error - Complex embedded document data
  const [created] = await (actor as unknown as Actor).createEmbeddedDocuments("Item", [updateData]);
  if (!created) return null;

  const createdItem = created as unknown as Item;
  if (!projectData.isCompleted) {
    console.debug(`Downtime Engine | Migration: Injecting activities for ${createdItem.name}`);
    await ProjectEngine.injectActivities(
      createdItem as unknown as Item5e,
      projectDataWithTarget.target,
    );
  }

  return created;
}
