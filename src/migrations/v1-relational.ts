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
  const SETTINGS_ID = "thefehrs-learning-manager";
  try {
    const library =
      (game.settings.get(
        SETTINGS_ID,
        "projectTemplates" as any,
      ) as unknown as ProjectTemplateV1[]) || [];
    let libraryUpdated = false;
    const actors = (game.actors || []) as Actor[];

    for (const actor of actors) {
      const projects = (actor.getFlag(SETTINGS_ID, "projects" as any) || []) as LegacyProjectV1[];
      if (projects.length === 0) continue;

      for (const p of projects) {
        if (p.templateId) continue;

        let tpl = library.find(
          (t) =>
            t.name === p.name &&
            t.target === (p.maxProgress ?? 100) &&
            t.rewardUuid === (p.rewardUuid || "") &&
            t.rewardType === (p.rewardType || "item") &&
            JSON.stringify(t.requirements || []) === JSON.stringify(p.requirements || []),
        );

        if (!tpl) {
          tpl = {
            id: (foundry.utils as unknown as { randomID: () => string }).randomID(),
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
      await actor.setFlag(SETTINGS_ID, "projects" as any, projects);
    }

    if (libraryUpdated) {
      await game.settings.set(SETTINGS_ID, "projectTemplates" as any, library);
    }
  } catch (error) {
    console.error("Downtime Engine relational migration failed:", error);
  }
}
