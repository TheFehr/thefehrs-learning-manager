import { MODULE_ID } from "../global.js";
import { Logger } from "../core/logger.js";

interface GuidanceTier {
  id: string;
  name: string;
  modifier: number;
  costs: Record<string, number>;
}

interface TeacherOffering {
  name: string;
  modifier: number;
  costs: Record<string, number>;
  categories: string[];
}

interface LearningBookBonus {
  modifier: number;
  categories: string[];
}

interface ProjectFlagData {
  tutelageId?: string;
  lastInstructorUuid?: string;
  lastInstructorName?: string;
  categories?: string[];
}

declare module "fvtt-types/configuration" {
  interface SettingConfig {
    "thefehrs-learning-manager.guidanceTiers": any[];
  }
}

export async function migrateToV3() {
  const rawTiers = game.settings.get(MODULE_ID, "guidanceTiers") as unknown as GuidanceTier[];
  if (!rawTiers || rawTiers.length === 0) {
    Logger.debug("No legacy guidance tiers found, skipping migration.");
    await game.settings.set(MODULE_ID, "migrationVersion", "3.0.0");
    return;
  }

  Logger.debug("Starting migration v3 (Tutelage Selection System)...");

  // 1. Scan for used tutelageIds
  const usedTierIds = new Set<string>();
  const actorsWithProjects: any[] = [];
  const actors = game.actors?.contents || [];

  for (const actor of actors as any[]) {
    const projects = (actor.items as any[]).filter((i) =>
      i.getFlag(MODULE_ID, "isLearningProject"),
    );
    if (projects.length > 0) {
      actorsWithProjects.push(actor);
      for (const project of projects) {
        const projectData = project.getFlag(MODULE_ID, "projectData") as ProjectFlagData;
        if (projectData && projectData.tutelageId) {
          usedTierIds.add(projectData.tutelageId);
        }
      }
    }
  }

  if (usedTierIds.size === 0) {
    Logger.debug("No projects using guidance tiers found. Just clearing settings.");
    await game.settings.set(MODULE_ID, "migrationVersion", "3.0.0");
    return;
  }

  // 2. Generate Dry Run Report
  const tiersToMigrate = rawTiers.filter((t) => usedTierIds.has(t.id));
  const orphanedIds = Array.from(usedTierIds).filter((id) => !rawTiers.some((t) => t.id === id));

  let reportHtml = `<h3>Tutelage System Migration: Dry Run Report</h3>
        <p>This migration will convert your legacy Guidance Tiers into a dynamic Instructor & Book system.</p>
        <ul>
            <li><strong>Tiers to migrate:</strong> ${tiersToMigrate.length}</li>
            <li><strong>Orphaned Tier IDs found:</strong> ${orphanedIds.length} (will be reset to Self-Study)</li>
            <li><strong>Actors affected:</strong> ${actorsWithProjects.length}</li>
        </ul>
        <p>A recovery compendium will be created for converted Instructors and Books.</p>
        <p>Proceed with migration?</p>`;

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Downtime Engine | Migration v3" },
    content: reportHtml,
    rejectClose: false,
    modal: true,
  });

  if (!confirmed) {
    // Leaving migrationVersion unchanged is intentional so the required migration
    // will prompt again on next load.
    Logger.warn("GM declined migration. Skipping for now.");
    return;
  }

  // 3. Create Recovery Compendiums
  const instructorPack = await getOrCreateCompendium("Actor", "Legacy Tutelage: Instructors");
  const bookPack = await getOrCreateCompendium("Item", "Legacy Tutelage: Books");

  if (!instructorPack || !bookPack) {
    Logger.error("Migration failed: Could not create/access recovery compendiums.");
    return;
  }

  const currentPacks =
    (game.settings.get(MODULE_ID, "teacherCompendiums") as unknown as string[]) || [];
  if (!currentPacks.includes(instructorPack.metadata.id)) {
    await game.settings.set(MODULE_ID, "teacherCompendiums", [
      ...currentPacks,
      instructorPack.metadata.id,
    ]);
  }

  const currentBookPacks =
    (game.settings.get(MODULE_ID, "bookCompendiums") as unknown as string[]) || [];
  if (!currentBookPacks.includes(bookPack.metadata.id)) {
    await game.settings.set(MODULE_ID, "bookCompendiums", [
      ...currentBookPacks,
      bookPack.metadata.id,
    ]);
  }

  const tierToDocMap = new Map<
    string,
    { type: "instructor" | "book"; uuid: string; offeringName: string }
  >();

  // 4. Convert used tiers to documents
  for (const tier of tiersToMigrate) {
    const hasCost = Object.values(tier.costs || {}).some((c) => c > 0);
    if (hasCost) {
      // Create Instructor Actor
      const offering: TeacherOffering = {
        name: tier.name,
        modifier: tier.modifier,
        costs: tier.costs,
        categories: [], // Match all by default
      };
      const actorData = {
        name: `${tier.name} (Legacy Instructor)`,
        type: "npc",
        img: "icons/svg/citizen.svg",
        flags: {
          [MODULE_ID]: {
            teacherOfferings: [offering],
          },
        },
      };
      const [created] = await (Actor as any).createDocuments([actorData], {
        pack: (instructorPack as any).collection,
      });
      tierToDocMap.set(tier.id, {
        type: "instructor",
        uuid: created.uuid,
        offeringName: offering.name,
      });
    } else if (tier.modifier > 0) {
      // Create Learning Book Item
      const bonus: LearningBookBonus = {
        modifier: tier.modifier,
        categories: [], // Match all by default
      };
      const itemData = {
        name: `${tier.name} (Legacy Book)`,
        type: "loot",
        img: "icons/svg/book.svg",
        flags: {
          [MODULE_ID]: {
            learningBookBonus: bonus,
          },
        },
      };
      const [created] = await (Item as any).createDocuments([itemData], {
        pack: (bookPack as any).collection,
      });
      tierToDocMap.set(tier.id, { type: "book", uuid: created.uuid, offeringName: "" });
    }
  }

  // 5. Update world items and distribute books
  for (const actor of actorsWithProjects) {
    const projects = (actor.items as any[]).filter((i) =>
      i.getFlag(MODULE_ID, "isLearningProject"),
    );
    for (const project of projects) {
      const projectData = project.getFlag(MODULE_ID, "projectData") as ProjectFlagData;
      if (!projectData || !projectData.tutelageId) continue;

      const mapping = tierToDocMap.get(projectData.tutelageId);
      if (!mapping) {
        // Orphaned or +0, reset
        projectData.tutelageId = "";
        await project.setFlag(MODULE_ID, "projectData", projectData);
        continue;
      }

      if (mapping.type === "instructor") {
        projectData.lastInstructorUuid = mapping.uuid;
        projectData.lastInstructorName = mapping.offeringName;
        projectData.tutelageId = "";

        // Detect categories from effects
        const detectedCats = detectCategories(project);
        if (detectedCats.length > 0) {
          projectData.categories = [...(projectData.categories || []), ...detectedCats];
          projectData.categories = [...new Set(projectData.categories)];
        }

        await project.setFlag(MODULE_ID, "projectData", projectData);
      } else if (mapping.type === "book") {
        // Distribute book to actor if they don't have it
        const bookDoc = await fromUuid(mapping.uuid as `Item.${string}`);
        if (bookDoc && bookDoc instanceof Item) {
          const existingBook = actor.items.find((i) => {
            const b = i.getFlag(MODULE_ID, "learningBookBonus") as LearningBookBonus;
            return (
              b &&
              b.modifier ===
                (bookDoc.getFlag(MODULE_ID, "learningBookBonus") as LearningBookBonus).modifier
            );
          });

          if (!existingBook) {
            const bookData = bookDoc.toObject();
            // Update the book to only work for this project's categories to match legacy behavior
            const bonus = bookData.flags[MODULE_ID].learningBookBonus as LearningBookBonus;
            const detectedCats = detectCategories(project);
            bonus.categories = detectedCats;

            // Set sourceId so the resolver recognizes it if compendium filtering is on
            bookData.flags.core = bookData.flags.core || {};
            (bookData.flags.core as any).sourceId = bookDoc.uuid;

            await actor.createEmbeddedDocuments("Item", [bookData]);
          }
        }
        projectData.tutelageId = "";

        // Detect categories from effects
        const detectedCats = detectCategories(project);
        if (detectedCats.length > 0) {
          projectData.categories = [...(projectData.categories || []), ...detectedCats];
          projectData.categories = [...new Set(projectData.categories)];
        }

        await project.setFlag(MODULE_ID, "projectData", projectData);
      }
    }
  }

  await game.settings.set(MODULE_ID, "migrationVersion", "3.0.0");
  ui.notifications?.info(
    `Migration to v3 (Tutelage Selection System) complete! Converted ${tiersToMigrate.length} tiers.`,
  );
}

function detectCategories(item: any): string[] {
  const categories: string[] = [];
  const effects = item.effects || [];
  for (const effect of effects) {
    for (const change of effect.changes || []) {
      const key = change.key || "";
      if (key.includes("abilities.str")) categories.push("strength");
      if (key.includes("abilities.dex")) categories.push("dexterity");
      if (key.includes("abilities.con")) categories.push("constitution");
      if (key.includes("abilities.int")) categories.push("intelligence");
      if (key.includes("abilities.wis")) categories.push("wisdom");
      if (key.includes("abilities.cha")) categories.push("charisma");

      if (key.includes("skills.acr")) categories.push("acrobatics");
      if (key.includes("skills.ani")) categories.push("animal handling");
      if (key.includes("skills.arc")) categories.push("arcana");
      if (key.includes("skills.ath")) categories.push("athletics");
      if (key.includes("skills.dec")) categories.push("deception");
      if (key.includes("skills.his")) categories.push("history");
      if (key.includes("skills.ins")) categories.push("insight");
      if (key.includes("skills.itm")) categories.push("intimidation");
      if (key.includes("skills.inv")) categories.push("investigation");
      if (key.includes("skills.med")) categories.push("medicine");
      if (key.includes("skills.nat")) categories.push("nature");
      if (key.includes("skills.prc")) categories.push("perception");
      if (key.includes("skills.prf")) categories.push("performance");
      if (key.includes("skills.per")) categories.push("persuasion");
      if (key.includes("skills.rel")) categories.push("religion");
      if (key.includes("skills.slt")) categories.push("sleight of hand");
      if (key.includes("skills.ste")) categories.push("stealth");
      if (key.includes("skills.sur")) categories.push("survival");
    }
  }
  return [...new Set(categories)];
}

async function getOrCreateCompendium(type: "Actor" | "Item", label: string) {
  const rawPackName = label.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const packName = rawPackName.replace(/-+/g, "-");

  // Try multiple ways to find it to be as robust as possible
  let pack =
    game.packs.get(`world.${packName}`) ||
    game.packs.get(`world.${rawPackName}`) ||
    game.packs.get(`${MODULE_ID}.${packName}`) ||
    game.packs.get(`${MODULE_ID}.${rawPackName}`);

  if (!pack) {
    pack = game.packs.find(
      (p) =>
        (p.metadata.name === packName ||
          p.metadata.name === rawPackName ||
          p.metadata.label === label) &&
        p.metadata.type === type,
    );
  }

  if (!pack) {
    try {
      pack = await (CompendiumCollection as any).createCompendium({
        type,
        label,
        name: packName,
        package: "world",
        system: game.system.id,
      });
    } catch (e: any) {
      // Final fallback: if creation fails because it already exists, try one last find by name only
      if (e.message?.includes("already exists")) {
        pack = game.packs.find(
          (p) => p.metadata.name === packName || p.metadata.name === rawPackName,
        );
        if (!pack) throw e; // If we STILL can't find it, something is very wrong
      } else {
        throw e;
      }
    }
  }
  return pack;
}
