export async function migrateToV1() {
  const SETTINGS_ID = "thefehrs-learning-manager";
  ui.notifications?.info("Migrating Downtime Engine projects to relational schema...");
  try {
    const library = (game.settings.get(SETTINGS_ID, "projectTemplates") as any[]) || [];
    let libraryUpdated = false;
    const failures: { actorId: string; error: any }[] = [];

    for (const actor of (game.actors || []) as any[]) {
      try {
        const projects = ((actor.getFlag(SETTINGS_ID, "projects") || []) as any[]) || [];
        if (!projects || projects.length === 0) continue;

        let actorUpdated = false;
        const migratedProjects = [];

        for (const p of projects) {
          if (p.templateId) {
            migratedProjects.push(p);
            continue;
          }

          let tpl = library.find(
            (t: any) =>
              t.name === p.name &&
              t.target === (p.maxProgress ?? 100) &&
              t.rewardUuid === (p.rewardUuid || "") &&
              t.rewardType === (p.rewardType || "item"),
          );
          if (!tpl) {
            tpl = {
              id: (foundry.utils as any).randomID(),
              name: p.name,
              target: p.maxProgress ?? 100,
              rewardUuid: p.rewardUuid || "",
              rewardType: p.rewardType || "item",
              requirements: [],
            };
            library.push(tpl);
            libraryUpdated = true;
          }

          migratedProjects.push({
            id: p.id,
            templateId: tpl.id,
            progress: p.progress || 0,
            target: tpl.target,
            guidanceTierId: p.guidanceTierId || "",
            isCompleted: p.isCompleted || false,
          });
          actorUpdated = true;
        }

        if (actorUpdated) {
          await actor.setFlag(SETTINGS_ID, "projects", migratedProjects);
        }
      } catch (error) {
        const actorId = actor.id || actor.name || "Unknown";
        console.error(`Migration failed for actor ${actorId}:`, error);
        failures.push({ actorId, error });
      }
    }

    if (libraryUpdated) {
      await game.settings.set(SETTINGS_ID, "projectTemplates", library);
    }
    await game.settings.set(SETTINGS_ID, "migrationVersion", "1.0.0");

    if (failures.length > 0) {
      ui?.notifications?.warn(
        `Downtime Engine projects migrated with ${failures.length} errors. Check console.`,
      );
    } else {
      ui?.notifications?.info("Downtime Engine projects migrated successfully!");
    }
  } catch (error) {
    console.error("Downtime Engine migration failed:", error);
    ui?.notifications?.error("Migration failed. Please check the console for details.");
    throw error;
  }
}
