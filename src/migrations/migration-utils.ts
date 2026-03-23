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
  let rewardDoc: any = null;
  try {
    rewardDoc = await fromUuid(rewardUuid as any);
  } catch (e) {
    console.warn(`Downtime Engine | fromUuid failed for ${rewardUuid}:`, e);
  }

  let itemData: any;
  // Handle Item Reward
  if (rewardDoc && rewardDoc instanceof Item) {
    const item5e = rewardDoc as unknown as Item5e;
    itemData = item5e.toObject();
  }
  // Handle ActiveEffect Reward
  else if (rewardDoc && rewardDoc instanceof ActiveEffect) {
    const effectData = rewardDoc.toObject();
    itemData = {
      name: projectData.name || rewardDoc.name || "Effect Reward",
      type: "feat",
      img: rewardDoc.img || "icons/svg/aura.svg",
      system: {
        description: {
          value: `<p>Reward Effect: <strong>${rewardDoc.name}</strong></p>`,
        },
        activities: {},
        type: { value: "" },
      },
      effects: [effectData],
    };
  }
  // Fallback: Placeholder for missing/invalid link
  else {
    const missingName = projectData.name || "Unknown Project";
    console.warn(
      `Downtime Engine | Migration: Could not resolve reward Item or Effect for project ${missingName} (UUID: ${rewardUuid}). Creating placeholder to preserve progress.`,
    );
    itemData = {
      name: "[MISSING REWARD] " + missingName,
      type: "feat",
      img: "icons/svg/hazard.svg",
      system: {
        description: {
          value: `<div style="border: 2px dashed #ff0000; padding: 10px; background: #fff1f1; color: #721c24;">
            <h3 style="margin-top: 0; color: #a94442;"><i class="fas fa-exclamation-triangle"></i> Broken Learning Project</h3>
            <p>The original reward link for this project is invalid or missing. The migration has created this placeholder to ensure that <strong>${actor.name}</strong> does not lose their progress.</p>
            <hr>
            <ul style="font-size: 0.9em; margin-bottom: 0;">
              <li><strong>Original Name:</strong> ${missingName}</li>
              <li><strong>Legacy Project ID:</strong> <code>${projectData.id || "N/A"}</code></li>
              <li><strong>Failed Reward UUID:</strong> <code>${rewardUuid}</code></li>
              <li><strong>Template ID:</strong> <code>${projectData.templateId || "N/A"}</code></li>
            </ul>
            <p style="margin-top: 10px; font-weight: bold; font-style: italic;">GM: To fix this, please configure a new reward item for this character's project.</p>
          </div>`,
        },
        activities: {},
        type: { value: "" },
      },
      effects: [],
    };
  }

  const stashedEffects = itemData.effects || [];
  const stashedActivities = itemData.system.activities || {};
  const stashedType = itemData.type || "feat";
  const stashedName = projectData.name || itemData.name || "Unknown Project";
  const stashedDescription = itemData.system.description?.value || "";
  const stashedSystem = itemData.system || {};
  const stashedSourceUuid = rewardUuid;

  const projectDataWithTarget = {
    ...projectData,
    target: projectData.target ?? defaultTarget,
    stashedName: stashedName,
    stashedDescription: stashedDescription,
    stashedSystem: stashedSystem,
    stashedSourceUuid: stashedSourceUuid,
  };

  const progressHtml = !projectData.isCompleted
    ? ProjectEngine.generateProgressHtml(
        projectData.progress || 0,
        projectDataWithTarget.target,
        "None",
      )
    : "";

  const updateData = {
    ...itemData,
    name: !projectData.isCompleted
      ? `${stashedName} (${projectData.progress || 0}/${projectDataWithTarget.target})`
      : stashedName,
    type: projectData.isCompleted ? stashedType : "feat",
    effects: projectData.isCompleted ? itemData.effects : [],
    "system.type.value": projectData.isCompleted
      ? (itemData.system as unknown as { type: { value: string } }).type?.value
      : "learning-project",
    "system.activities": projectData.isCompleted ? itemData.system.activities : {},
    "system.description.value": !projectData.isCompleted
      ? progressHtml + stashedDescription
      : stashedDescription,
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

  return createdItem;
}
