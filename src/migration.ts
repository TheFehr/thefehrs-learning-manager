import { Settings } from "./settings";
import { ActorProxy } from "./actor-proxy";
import type { LearningProject } from "./types";

export async function migrateData() {
  let version = Settings.migrationVersion;
  if (version >= 2 || !game.user?.isGM) return;

  if (version < 1) {
    ui.notifications?.info("Migrating Downtime Engine projects to relational schema...");
    try {
      const library = Settings.projectTemplates;
      let libraryUpdated = false;
      const failures: { actorId: string; error: any }[] = [];

      for (const actor of (game.actors || []) as any[]) {
        try {
          const proxy = ActorProxy.forActor(actor);
          const projects = (proxy.projects as any[]) || [];
          if (!projects || projects.length === 0) continue;

          let actorUpdated = false;
          const migratedProjects: LearningProject[] = [];

          for (const p of projects) {
            if (p.templateId) {
              migratedProjects.push(p);
              continue;
            }

            let tpl = library.find(
              (t) =>
                t.name === p.name &&
                t.target === (p.maxProgress ?? 100) &&
                t.rewardUuid === (p.rewardUuid || "") &&
                t.rewardType === (p.rewardType || "item"),
            );
            if (!tpl) {
              tpl = {
                id: foundry.utils.randomID(),
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
              guidanceTierId: p.guidanceTierId || "",
              isCompleted: p.isCompleted || false,
            });
            actorUpdated = true;
          }

          if (actorUpdated) await proxy.setProjects(migratedProjects);
        } catch (error) {
          const actorId = actor.id || actor.name || "Unknown";
          console.error(`Migration failed for actor ${actorId}:`, error);
          failures.push({ actorId, error });
        }
      }

      if (libraryUpdated) await Settings.setProjectTemplates(library);
      await Settings.setMigrationVersion(1);
      version = 1;

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
      return;
    }
  }

  if (version < 2) {
    ui.notifications?.info("Migrating Downtime Engine guidance costs from gp to cp...");
    try {
      const tiers = Settings.guidanceTiers;
      let tiersUpdated = false;
      for (const tier of tiers) {
        if (!tier._migratedToV2 && tier.costs) {
          for (const key of Object.keys(tier.costs)) {
            tier.costs[key] = Math.round(tier.costs[key] * 100);
          }
          tier._migratedToV2 = true;
          tiersUpdated = true;
        }
      }
      if (tiersUpdated) {
        await Settings.setGuidanceTiers(tiers);
      }
      await Settings.setMigrationVersion(2);
      ui?.notifications?.info("Downtime Engine guidance costs migrated to cp successfully!");
    } catch (error) {
      console.error("Downtime Engine migration to v2 failed:", error);
      ui?.notifications?.error("Migration to v2 failed. Please check the console for details.");
    }
  }
}
