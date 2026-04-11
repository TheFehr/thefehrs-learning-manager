import { MODULE_ID } from "../global.js";
import { Logger } from "../core/logger.js";

interface Actor5e {
  name: string;
  getFlag(scope: string, key: string): any;
  setFlag(scope: string, key: string, value: any): Promise<any>;
  items: any;
  createEmbeddedDocuments(type: string, data: any[]): Promise<any[]>;
}

interface Item5e {
  name: string;
  uuid: string;
  toObject(): any;
  getFlag(scope: string, key: string): any;
  update(data: any): Promise<any>;
}

/**
 * NOTE: This file is a self-contained utility for migrations.
 * It contains simplified versions of production logic to ensure migrations
 * remain stable even if production code changes.
 */

function generateProgressHtml(progress: number, target: number, tutelageName: string): string {
  const p = Number.isFinite(progress) ? Math.max(0, progress) : 0;
  const t = Number.isFinite(target) ? Math.max(0, target) : 0;
  const escapedTutelageName = (foundry.utils as any).escapeHTML(tutelageName);
  const percentage = t > 0 ? Math.min(100, Math.max(0, (p / t) * 100)) : 0;
  return `<!-- learning-manager:progress-start -->
<div class="learning-manager-progress-container" style="margin: 0.5rem 0 1rem 0; padding: 0.5rem; border: 1px solid var(--t5e-faint-color); border-radius: 4px; background: var(--t5e-background); font-family: var(--t5e-font-family);">
  <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 4px; font-size: 0.75rem; color: var(--t5e-secondary-color);">
    <span>Training Progress (${escapedTutelageName})</span>
    <span>${p} / ${t}</span>
  </div>
  <div style="width: 100%; height: 12px; background: rgba(0,0,0,0.1); border-radius: 6px; overflow: hidden; position: relative;">
    <div style="width: ${percentage}%; height: 100%; background: var(--t5e-hp-bar-color, #4caf50); transition: width 0.4s ease-in-out;"></div>
  </div>
</div>
<!-- learning-manager:progress-end -->`;
}

function createBaseActivityTemplate(): any {
  return {
    override: false,
    concentration: false,
    prompt: false,
    type: "utility",
    activation: { type: "special", override: false, condition: "", value: 1 },
    consumption: {
      value: "1",
      scaling: { allowed: false, max: "" },
      spellSlot: false,
      targets: [],
    },
    description: { chatFlavor: "" },
    duration: { value: "1", units: "perm", concentration: false, override: false, special: "" },
    effects: [],
    flags: {},
    range: { value: "0", units: "self", override: false, special: "" },
    target: {
      template: {
        count: "1",
        size: "0",
        width: "0",
        height: "0",
        contiguous: false,
        units: "ft",
        type: "",
      },
      affects: { count: "1", choice: false, type: "", special: "" },
      override: false,
      prompt: false,
    },
    uses: { spent: 0, recovery: [], max: "" },
    visibility: {
      identifier: "",
      level: { min: null, max: null },
      requireAttunement: false,
      requireIdentification: false,
      requireMagic: false,
    },
  };
}

async function injectActivities(item: Item5e, target: number) {
  if (target <= 0) return;

  const timeUnits = (game.settings.get(MODULE_ID, "timeUnits") as unknown as any[]) || [];
  const activities: any[] = timeUnits.map((tu) => ({
    ...createBaseActivityTemplate(),
    _id: (foundry.utils as any).randomID(),
    img: "icons/svg/book.svg",
    sort: 0,
    description: { chatFlavor: `Training for ${tu.name}` },
    flags: { [MODULE_ID]: { isLearningActivity: true, timeUnitId: tu.id } },
    name: `Train ${tu.name}`,
  }));

  activities.push({
    ...createBaseActivityTemplate(),
    _id: (foundry.utils as any).randomID(),
    img: "icons/svg/coins.svg",
    sort: 100,
    description: { chatFlavor: "Spending all available training time" },
    flags: { [MODULE_ID]: { isLearningActivity: true, isSpendAll: true } },
    name: "Spend all time",
  });

  const activityUpdates: Record<string, any> = {};
  for (const activity of activities) {
    activityUpdates[activity._id] = activity;
  }

  await item.update({ "system.activities": activityUpdates } as any);
}

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
    Logger.warn(`fromUuid failed for ${rewardUuid}:`, e);
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
    Logger.warn(
      `Migration: Could not resolve reward Item or Effect for project ${missingName} (UUID: ${rewardUuid}). Creating placeholder to preserve progress.`,
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
    ? generateProgressHtml(projectData.progress || 0, projectDataWithTarget.target, "None")
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

  if (typeof (actor as any).createEmbeddedDocuments !== "function") {
    Logger.error(`Actor ${actor.name} is missing createEmbeddedDocuments method.`);
    return null;
  }

  const [created] = await (actor as any).createEmbeddedDocuments("Item", [updateData]);
  if (!created) return null;

  const createdItem = created as any;
  if (!projectData.isCompleted) {
    Logger.debug(`Migration: Injecting activities for ${createdItem.name}`);
    await injectActivities(createdItem as any, projectDataWithTarget.target);
  }

  return createdItem;
}
