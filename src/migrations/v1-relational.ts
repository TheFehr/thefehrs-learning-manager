import { MODULE_ID } from "@/global.js";
import { Logger } from "@/core/logger.js";
import { FoundryUtils } from "@/core/foundry-utils.js";
import { getGame } from "@/core/foundry.js";

interface LegacyProjectV1 {
  id?: string;
  name?: string;
  templateId?: string;
  progress?: number;
  maxProgress?: number;
  rewardUuid?: string;
  rewardType?: string;
  requirements?: unknown[];
}

interface ProjectTemplateV1 {
  id: string;
  name: string;
  target: number;
  rewardUuid: string;
  rewardType: string;
  requirements: unknown[];
}

export async function migrateToV1Relational() {
  // NOTE: The use of `as any` casts here is intentional. TypeScript cannot statically know
  // the types of dynamically-registered Foundry settings during migration phases.
  // This pattern is limited to migration code and is acceptable for now.
  try {
    const game = getGame();
    const library =
      (game.settings.get(MODULE_ID, "projectTemplates" as any) as unknown as ProjectTemplateV1[]) ||
      [];
    let libraryUpdated = false;
    const actors = game.actors?.contents || [];

    for (const actor of actors as any[]) {
      const projects = (actor.getFlag(MODULE_ID, "projects" as any) || []) as LegacyProjectV1[];
      if (projects.length === 0) continue;

      for (const p of projects) {
        if (p.templateId) continue;

        let tpl = library.find(
          (t) =>
            t.name === (p.name || "Unknown Project") &&
            t.target === (p.maxProgress ?? 100) &&
            t.rewardUuid === (p.rewardUuid || "") &&
            t.rewardType === (p.rewardType || "item") &&
            JSON.stringify(t.requirements || []) === JSON.stringify(p.requirements || []),
        );

        if (!tpl) {
          tpl = {
            id: FoundryUtils.randomID(),
            name: p.name || "Unknown Project",
            target: p.maxProgress ?? 100,
            rewardUuid: p.rewardUuid || "",
            rewardType: p.rewardType || "item",
            requirements: p.requirements || [],
          };
          library.push(tpl);
          libraryUpdated = true;
        }

        p.templateId = tpl.id;
      }
      await actor.setFlag(MODULE_ID, "projects" as any, projects);
    }

    if (libraryUpdated) {
      await game.settings.set(MODULE_ID, "projectTemplates" as any, library);
    }
  } catch (error) {
    Logger.error("relational migration failed:", true, error);
    throw error;
  }
}
