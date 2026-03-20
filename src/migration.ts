import { Settings } from "./settings";
import { ActorProxy } from "./actor-proxy";
import type { LearningProject } from "./types";

/**
 * Compares two version strings (semver-like) or numbers.
 * Returns true if v1 > v2.
 */
function isNewerVersion(v1: string | number, v2: string | number): boolean {
  if (typeof v1 === "number" && typeof v2 === "number") return v1 > v2;

  const s1 = String(v1).split(".");
  const s2 = String(v2).split(".");

  for (let i = 0; i < Math.max(s1.length, s2.length); i++) {
    const n1 = parseInt(s1[i] || "0");
    const n2 = parseInt(s2[i] || "0");
    if (n1 > n2) return true;
    if (n1 < n2) return false;
  }
  return false;
}

export async function migrateData() {
  if (!game.user?.isGM) return;

  let version = Settings.migrationVersion;
  console.debug("Downtime Engine | Migration: Current version", version);
  const LATEST_VERSION = "2.0.0";
  if (!isNewerVersion(LATEST_VERSION, version)) return;

  if (version === "0" || !version) {
    console.debug("Downtime Engine | Migration: Version is 0, running direct migration");
    await migrateToV2Direct();
    return;
  }

  // v1: Relational Schema
  if (!isNewerVersion(version, 0) && isNewerVersion("1.0.0", version)) {
    ui.notifications?.info("Migrating Downtime Engine projects to relational schema...");
    try {
      const library = (game.settings.get(Settings.ID, "projectTemplates") as any[]) || [];
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
              target: tpl.target,
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

      if (libraryUpdated) {
        await game.settings.set(Settings.ID, "projectTemplates", library);
      }
      await Settings.setMigrationVersion("1.0.0");
      version = "1.0.0";

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

  // v2: GP to CP costs
  if (!isNewerVersion(version, "1.0.0") && isNewerVersion("1.1.0", version)) {
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
      await Settings.setMigrationVersion("1.1.0");
      version = "1.1.0";
      ui?.notifications?.info("Downtime Engine guidance costs migrated to cp successfully!");
    } catch (error) {
      console.error("Downtime Engine migration to v1.1.0 failed:", error);
      ui?.notifications?.error("Migration to v1.1.0 failed. Please check the console for details.");
    }
  }

  // v3: Default Crit Rules
  if (!isNewerVersion(version, "1.1.0") && isNewerVersion("1.2.0", version)) {
    ui.notifications?.info("Migrating Downtime Engine critical hit rules...");
    try {
      const rules = Settings.rules || { method: "roll" };
      if (!rules.critDoubleStrategy) {
        rules.critDoubleStrategy = "never";
        rules.critThreshold = 10;
        await Settings.setRules(rules);
      }
      await Settings.setMigrationVersion("1.2.0");
      version = "1.2.0";
      ui?.notifications?.info("Downtime Engine critical hit rules migrated successfully!");
    } catch (error) {
      console.error("Downtime Engine migration to v1.2.0 failed:", error);
      ui?.notifications?.error("Migration to v1.2.0 failed. Please check the console for details.");
    }
  }

  // 2.0.0: Native Items & Template-less Model (Merged v4 & v5)
  if (!isNewerVersion(version, "1.2.0") && isNewerVersion("2.0.0", version)) {
    ui.notifications?.info("Migrating Downtime Engine projects to native Items (v2.0.0)...");
    try {
      const { ProjectEngine } = await import("./project-engine");
      const compendiumLabel = "UDE Migration";
      const compendiumName = "ude-migration";
      const compendiumKey = `world.${compendiumName}`;

      let pack = game.packs.get(compendiumKey);
      if (!pack) {
        pack = (await CompendiumCollection.createCompendium({
          type: "Item",
          label: compendiumLabel,
          name: compendiumName,
        })) as any;
      }

      const templates = (game.settings.get(Settings.ID, "projectTemplates") as any[]) || [];
      const actors = (game.actors || []) as any[];

      let migratedCount = 0;
      let totalProjects = 0;

      // Count for progress bar
      for (const actor of actors) {
        const proxy = ActorProxy.forActor(actor);
        totalProjects += proxy.projects.length;
      }

      for (const actor of actors) {
        // Step 1: Migrate legacy actor projects to Items (former v4)
        const proxy = ActorProxy.forActor(actor);
        const projects = proxy.projects;

        if (projects.length > 0) {
          for (const p of projects) {
            const tpl = templates.find((t) => t.id === p.templateId);
            if (tpl) {
              // Ensure target is injected during creation (former v5)
              p.target = p.target ?? tpl.target;
              await ProjectEngine.createProjectItem(actor, tpl, p);
            }
            migratedCount++;
            ui.notifications?.info(`Migrating projects: ${migratedCount}/${totalProjects}`, {
              progress: migratedCount / totalProjects,
            } as any);
          }
          await proxy.setProjects([]);
        }

        // Step 2: Ensure all existing Item-projects have targets (former v5 for already-v4-migrated items)
        const learningItems = actor.items.filter(
          (i: any) =>
            i.getFlag(Settings.ID, "isLearningProject") ||
            i.getFlag(Settings.ID, "isLearnedReward"),
        );

        for (const item of learningItems) {
          const projectData = item.getFlag(Settings.ID, "projectData") as any;
          const isLearnedReward = item.getFlag(Settings.ID, "isLearnedReward");
          const updates: any = {};

          if (projectData && typeof projectData.target === "undefined") {
            const tpl = templates.find((t) => t.id === projectData.templateId);
            if (tpl) {
              projectData.target = tpl.target;
              updates[`flags.${Settings.ID}.projectData`] = projectData;
            }
          }

          if (!item.getFlag("tidy5e-sheet", "section")) {
            updates["flags.tidy5e-sheet.section"] = isLearnedReward
              ? "Completed Learning"
              : "In-Progress Learning";
          }

          if (Object.keys(updates).length > 0) {
            await item.update(updates);
          }
        }
      }

      await Settings.setMigrationVersion("2.0.0");
      ui?.notifications?.info(`Successfully migrated to v2.0.0!`);
    } catch (error) {
      console.error("Downtime Engine migration to v2.0.0 failed:", error);
      ui?.notifications?.error("Migration to v2.0.0 failed. Please check the console for details.");
    }
  }
}

/**
 * Direct migration from version 0 to 2.0.0.
 */
async function migrateToV2Direct() {
  ui.notifications?.info("Downtime Engine: Performing direct migration to v2.0.0...");
  try {
    const { ProjectEngine } = await import("./project-engine");

    // 1. Rules Migration (v3 equivalent)
    const rules = Settings.rules || { method: "roll" };
    console.debug("Downtime Engine | Migration: Initial rules", rules);
    console.debug(
      "Downtime Engine | Migration: Settings object check",
      (Settings as any).settings === game.settings,
    );
    if (!rules.critDoubleStrategy) {
      console.debug("Downtime Engine | Migration: Setting default crit rules");
      rules.critDoubleStrategy = "never";
      rules.critThreshold = 10;
      console.debug("Downtime Engine | Migration: About to call Settings.setRules");
      await Settings.setRules(rules);
      console.debug("Downtime Engine | Migration: Settings.setRules finished");
    }

    // 2. Guidance Tiers Migration (v2 equivalent)
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

    // 3. Library and Item Migration (v1 + v4 + v5 equivalent)
    const library = (game.settings.get(Settings.ID, "projectTemplates") as any[]) || [];
    let libraryUpdated = false;
    const actors = (game.actors || []) as any[];

    for (const actor of actors) {
      const proxy = ActorProxy.forActor(actor);
      const projects = (proxy.projects as any[]) || [];
      if (projects.length === 0) continue;

      for (const p of projects) {
        // Find or create template (v1 logic)
        let tpl = library.find(
          (t) =>
            t.id === p.templateId ||
            (t.name === p.name &&
              t.target === (p.maxProgress ?? 100) &&
              t.rewardUuid === (p.rewardUuid || "") &&
              t.rewardType === (p.rewardType || "item")),
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

        // Create native Item from template and project data (v4 + v5 logic)
        const projectData: LearningProject = {
          id: p.id,
          templateId: tpl.id,
          progress: p.progress || 0,
          target: p.target ?? tpl.target,
          guidanceTierId: p.guidanceTierId || "",
          isCompleted: p.isCompleted || false,
        };

        await ProjectEngine.createProjectItem(actor, tpl, projectData);
      }

      // Clear legacy projects from actor
      await proxy.setProjects([]);
    }

    if (libraryUpdated) {
      await game.settings.set(Settings.ID, "projectTemplates", library);
    }

    await Settings.setMigrationVersion("2.0.0");
    ui?.notifications?.info("Downtime Engine direct migration to v2.0.0 successful!");
  } catch (error) {
    console.error("Downtime Engine direct migration failed:", error);
    ui?.notifications?.error("Direct migration failed. Please check the console for details.");
  }
}
