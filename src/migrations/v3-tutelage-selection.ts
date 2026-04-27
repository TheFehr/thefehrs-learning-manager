import { MODULE_ID } from "@/global.js";
import { Logger } from "@/core/logger.js";
import { getGame, getUI } from "@/core/foundry.js";
import { registerMigrationSettings } from "./migration-registration.js";

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

function mergeCategories(projectData: ProjectFlagData, detectedCats: string[]) {
  if (detectedCats.length > 0) {
    projectData.categories = [...new Set([...(projectData.categories || []), ...detectedCats])];
  }
}

declare module "fvtt-types/configuration" {
  interface SettingConfig {
    "thefehrs-learning-manager.guidanceTiers": any[];
  }
}

const LEGACY_SELF_STUDY_TIER_ID = "+0";

export async function migrateToV3() {
  registerMigrationSettings();
  const game = getGame();

  // 1. Scan for used tutelageIds first to determine if migration is actually needed
  const usedTierIds = new Set<string>();
  const actorsWithProjects: Actor[] = [];
  const actors = game.actors?.contents || [];

  for (const actor of actors) {
    const projects = (actor.items as any).filter((i: any) =>
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
    Logger.debug("No projects using guidance tiers found. Marking migration as complete.");
    await game.settings.set(MODULE_ID, "migrationVersion", "3.0.0");
    Logger.info("Migration to 3.0.0 applied (no active guidance tiers found).");
    return;
  }

  // 2. Read legacy guidance tiers
  let rawTiers: GuidanceTier[];
  try {
    const stored = game.settings.get(MODULE_ID, "guidanceTiers");
    if (!Array.isArray(stored)) {
      Logger.warn(`Migration v3 | ${MODULE_ID}.guidanceTiers is not an array.`, false, stored);
      rawTiers = [];
    } else {
      rawTiers = stored.filter((t: any) => {
        const isValid =
          t &&
          typeof t === "object" &&
          typeof t.id === "string" &&
          typeof t.name === "string" &&
          t.name.trim().length > 0 &&
          typeof t.modifier === "number" &&
          t.costs &&
          typeof t.costs === "object";

        if (!isValid) {
          Logger.warn(
            `Migration v3 | Dropping invalid guidance tier: ${JSON.stringify(t || "null")}`,
          );
        }
        return isValid;
      }) as GuidanceTier[];
    }
  } catch (err) {
    Logger.error(`Migration v3 | Failed to read ${MODULE_ID}.guidanceTiers:`, false, err);
    return;
  }

  if (rawTiers.length === 0) {
    Logger.debug(
      `Migration v3 | No legacy guidance tiers found for ${MODULE_ID}, but projects use them. Skipping for now (will retry).`,
    );
    return;
  }

  Logger.debug("Starting migration v3 (Tutelage Selection System)...");

  // 3. Generate Dry Run Report
  const tiersToMigrate = rawTiers.filter((t) => usedTierIds.has(t.id));
  const orphanedIds = Array.from(usedTierIds).filter((id) => !rawTiers.some((t) => t.id === id));
  const orphanedSet = new Set(orphanedIds);

  let reportHtml = `<h3>Tutelage System Migration: Dry Run Report</h3>
        <p>This migration will convert your legacy Guidance Tiers into a dynamic Instructor & Book system.</p>
        <ul>
            <li><strong>Tiers to migrate:</strong> ${tiersToMigrate.length}</li>
            <li><strong>Orphaned Tier IDs found:</strong> ${orphanedIds.length} (will be reset to Self-Study)</li>
            <li><strong>Actors affected:</strong> ${actorsWithProjects.length}</li>
        </ul>
        <p>Recovery compendiums will be created for converted Instructors and Books.</p>
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

  // 4. Create Recovery Compendiums
  let instructorPack, bookPack;
  try {
    instructorPack = await getOrCreateCompendium("Actor", "Legacy Tutelage: Instructors");
    bookPack = await getOrCreateCompendium("Item", "Legacy Tutelage: Books");
  } catch (err) {
    Logger.error("Migration failed: Error creating recovery compendiums:", true, err);
    return;
  }

  if (!instructorPack || !bookPack) {
    Logger.error("Migration failed: Could not create/access recovery compendiums.", true);
    return;
  }

  const teacherPacksSetting = game.settings.get(MODULE_ID, "teacherCompendiums");
  const currentPacks = Array.isArray(teacherPacksSetting) ? (teacherPacksSetting as string[]) : [];

  if (!currentPacks.includes(instructorPack.metadata.id)) {
    await game.settings.set(MODULE_ID, "teacherCompendiums", [
      ...currentPacks,
      instructorPack.metadata.id,
    ]);
  }

  const bookPacksSetting = game.settings.get(MODULE_ID, "bookCompendiums");
  const currentBookPacks = Array.isArray(bookPacksSetting) ? (bookPacksSetting as string[]) : [];

  if (!currentBookPacks.includes(bookPack.metadata.id)) {
    await game.settings.set(MODULE_ID, "bookCompendiums", [
      ...currentBookPacks,
      bookPack.metadata.id,
    ]);
  }

  const tierToDocMap = new Map<
    string,
    { type: "instructor" | "book" | "self-study"; uuid: string; offeringName: string }
  >();

  // 5. Convert used tiers to documents
  const instructorPackId = (instructorPack as any).metadata.id;
  const bookPackId = (bookPack as any).metadata.id;

  const [instructorIndex, bookIndex] = await Promise.all([
    (instructorPack as any).getIndex({ fields: [`flags.${MODULE_ID}.legacyTierId`] }),
    (bookPack as any).getIndex({ fields: [`flags.${MODULE_ID}.legacyTierId`] }),
  ]);

  let projectFailures = 0;
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

      // Check if already exists
      const existing = instructorIndex.find(
        (e: any) =>
          (e.flags?.[MODULE_ID]?.legacyTierId || e[`flags.${MODULE_ID}.legacyTierId`]) === tier.id,
      );

      if (existing) {
        tierToDocMap.set(tier.id, {
          type: "instructor",
          uuid: `Compendium.${instructorPackId}.Actor.${existing._id}`,
          offeringName: offering.name,
        });
        continue;
      }

      const actorData = {
        name: `${tier.name} (Legacy Instructor)`,
        type: "npc",
        img: "icons/svg/citizen.svg",
        flags: {
          [MODULE_ID]: {
            teacherOfferings: [offering],
            legacyTierId: tier.id,
          },
        },
      };
      let created;
      try {
        const result = await (Actor as any).createDocuments([actorData], {
          pack: instructorPackId,
        });
        if (Array.isArray(result) && result.length > 0) {
          created = result[0];
        } else {
          Logger.error(
            `Migration v3 | Failed to create legacy instructor for tier ${tier.id}: Result was empty or non-array.`,
            true,
            result,
          );
        }
      } catch (err) {
        Logger.error(
          `Migration v3 | Failed to create legacy instructor for tier ${tier.id}:`,
          true,
          err,
        );
      }

      if (created) {
        tierToDocMap.set(tier.id, {
          type: "instructor",
          uuid: created.uuid,
          offeringName: offering.name,
        });
      }
    } else if (tier.modifier > 0) {
      // Create Learning Book Item
      const bonus: LearningBookBonus = {
        modifier: tier.modifier,
        categories: [], // Match all by default
      };

      // Check if already exists
      const existing = bookIndex.find(
        (e: any) =>
          (e.flags?.[MODULE_ID]?.legacyTierId || e[`flags.${MODULE_ID}.legacyTierId`]) === tier.id,
      );

      if (existing) {
        tierToDocMap.set(tier.id, {
          type: "book",
          uuid: `Compendium.${bookPackId}.Item.${existing._id}`,
          offeringName: "",
        });
        continue;
      }

      const itemData = {
        name: `${tier.name} (Legacy Book)`,
        type: "loot",
        img: "icons/svg/book.svg",
        flags: {
          [MODULE_ID]: {
            learningBookBonus: bonus,
            legacyTierId: tier.id,
          },
        },
      };
      let created;
      try {
        const result = await (Item as any).createDocuments([itemData], {
          pack: bookPackId,
        });
        if (Array.isArray(result) && result.length > 0) {
          created = result[0];
        } else {
          Logger.error(
            `Migration v3 | Failed to create legacy book for tier ${tier.id}: Result was empty or non-array.`,
            true,
            result,
          );
        }
      } catch (err) {
        Logger.error(`Migration v3 | Failed to create legacy book for tier ${tier.id}:`, true, err);
      }

      if (created) {
        tierToDocMap.set(tier.id, { type: "book", uuid: created.uuid, offeringName: "" });
      }
    } else {
      // No cost and non-positive modifier, treat as self-study
      tierToDocMap.set(tier.id, {
        type: "self-study",
        uuid: "",
        offeringName: "",
      });
    }
  }

  // 6. Update world items and distribute books
  for (const actor of actorsWithProjects) {
    const projects = (actor.items as any).filter((i: any) =>
      i.getFlag(MODULE_ID, "isLearningProject"),
    );
    for (const project of projects) {
      try {
        const projectData = project.getFlag(MODULE_ID, "projectData") as ProjectFlagData;
        if (!projectData || !projectData.tutelageId) continue;

        const detectedCats = detectCategories(project);

        const mapping = tierToDocMap.get(projectData.tutelageId);
        if (!mapping) {
          const isTrulyOrphaned =
            orphanedSet.has(projectData.tutelageId) ||
            projectData.tutelageId === LEGACY_SELF_STUDY_TIER_ID;
          if (isTrulyOrphaned) {
            // Orphaned or explicit self-study, reset
            projectData.tutelageId = "";
            await project.setFlag(MODULE_ID, "projectData", projectData);
          } else {
            // Not a known orphan, preserve ID for manual review/retry
            Logger.warn(
              `Migration v3 | Project ${project.name} (${project.id}) on actor ${actor.name} has missing mapping for tutelageId "${projectData.tutelageId}", but it is not a known orphan. Preserving ID.`,
              true,
            );
            projectFailures++;
          }
          continue;
        }

        if (mapping.type === "instructor") {
          projectData.lastInstructorUuid = mapping.uuid;
          projectData.lastInstructorName = mapping.offeringName;
          projectData.tutelageId = "";

          // Detect categories from effects
          mergeCategories(projectData, detectedCats);

          await project.setFlag(MODULE_ID, "projectData", projectData);
        } else if (mapping.type === "book") {
          // Distribute book to actor if they don't have it
          const bookDoc = await fromUuid(mapping.uuid as any);
          if (!(bookDoc instanceof Item)) {
            Logger.error(
              `Migration v3 | Legacy book document could not be resolved: ${mapping.uuid}`,
              true,
            );
            projectFailures++;
            continue;
          }

          const bookBonus = bookDoc.getFlag(MODULE_ID, "learningBookBonus") as LearningBookBonus;
          if (!bookBonus) {
            Logger.error(
              `Migration v3 | Legacy book document ${bookDoc.uuid} is missing learningBookBonus flag.`,
              true,
            );
            projectFailures++;
            continue;
          }

          const existingBook = (actor.items as any).find((i: any) => {
            const existingBonus = i.getFlag(MODULE_ID, "learningBookBonus") as LearningBookBonus;
            if (!existingBonus || existingBonus.modifier !== bookBonus.modifier) return false;
            const existingCats = existingBonus.categories || [];
            const newCats = detectedCats || [];
            if (existingCats.length !== newCats.length) return false;
            const sortedA = [...existingCats].sort();
            const sortedB = [...newCats].sort();
            return sortedA.every((v, idx) => v === sortedB[idx]);
          });

          if (!existingBook) {
            const bookData = bookDoc.toObject();
            // Update the book to only work for this project's categories to match legacy behavior
            if (!bookData.flags) bookData.flags = {};
            if (!bookData.flags[MODULE_ID]) bookData.flags[MODULE_ID] = {};

            const bonus = (bookData.flags[MODULE_ID] as any).learningBookBonus as LearningBookBonus;
            if (bonus) {
              bonus.categories = detectedCats;
            } else {
              (bookData.flags[MODULE_ID] as any).learningBookBonus = {
                modifier: bookBonus.modifier,
                categories: detectedCats,
              };
            }

            // Ensure both _stats.compendiumSource (primary v13 field) and flags.core.sourceId (legacy compatibility) are set
            bookData._stats = bookData._stats || {};
            bookData._stats.compendiumSource = bookDoc.uuid;
            bookData.flags.core = bookData.flags.core || {};
            (bookData.flags.core as any).sourceId = bookDoc.uuid;

            await actor.createEmbeddedDocuments("Item", [bookData]);
          }
          projectData.tutelageId = "";

          // Detect categories from effects
          mergeCategories(projectData, detectedCats);

          await project.setFlag(MODULE_ID, "projectData", projectData);
        } else if (mapping.type === "self-study") {
          projectData.tutelageId = "";

          // Detect categories from effects
          mergeCategories(projectData, detectedCats);

          await project.setFlag(MODULE_ID, "projectData", projectData);
        }
      } catch (err) {
        Logger.error(
          `Migration v3 | Failed to update project ${project.name} on actor ${actor.name}:`,
          true,
          err,
        );
        projectFailures++;
      }
    }
  }

  if (projectFailures === 0) {
    await game.settings.set(MODULE_ID, "migrationVersion", "3.0.0");
    getUI()?.notifications?.info(
      `Migration to v3 (Tutelage Selection System) complete! Converted ${tiersToMigrate.length} tiers.`,
    );
  } else {
    getUI()?.notifications?.warn(
      `Migration to v3 partially completed with ${projectFailures} project failures. See console for details.`,
    );
  }
}

const ABILITY_MAP: Record<string, string> = {
  "abilities.str": "strength",
  "abilities.dex": "dexterity",
  "abilities.con": "constitution",
  "abilities.int": "intelligence",
  "abilities.wis": "wisdom",
  "abilities.cha": "charisma",
};

const SKILL_MAP: Record<string, string> = {
  "skills.acr": "acrobatics",
  "skills.ani": "animal handling",
  "skills.arc": "arcana",
  "skills.ath": "athletics",
  "skills.dec": "deception",
  "skills.his": "history",
  "skills.ins": "insight",
  "skills.itm": "intimidation",
  "skills.inv": "investigation",
  "skills.med": "medicine",
  "skills.nat": "nature",
  "skills.prc": "perception",
  "skills.prf": "performance",
  "skills.per": "persuasion",
  "skills.rel": "religion",
  "skills.slt": "sleight of hand",
  "skills.ste": "stealth",
  "skills.sur": "survival",
};

function detectCategories(item: any): string[] {
  const categories: string[] = [];
  const effects = item.effects || [];
  for (const effect of effects) {
    for (const change of effect.changes || []) {
      const key = change.key || "";
      for (const [prefix, cat] of Object.entries(ABILITY_MAP)) {
        if (key.includes(prefix)) categories.push(cat);
      }
      for (const [prefix, cat] of Object.entries(SKILL_MAP)) {
        if (key.includes(prefix)) categories.push(cat);
      }
    }
  }
  return [...new Set(categories)];
}

async function getOrCreateCompendium(type: "Actor" | "Item", label: string) {
  const game = getGame();
  const rawPackName = label.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const packName = rawPackName.replace(/-+/g, "-");

  // Try multiple ways to find it to be as robust as possible
  let pack =
    game.packs!.get(`world.${packName}`) ||
    game.packs!.get(`world.${rawPackName}`) ||
    game.packs!.get(`${MODULE_ID}.${packName}`) ||
    game.packs!.get(`${MODULE_ID}.${rawPackName}`);

  if (!pack) {
    pack = game.packs!.find(
      (p: any) =>
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
      const safeMessage = typeof e.message === "string" ? e.message.toLowerCase() : "";
      const isExistsError = safeMessage.includes("already exists") || e.code === "EEXIST";
      if (isExistsError) {
        pack = game.packs!.find(
          (p: any) =>
            (p.metadata.name === packName || p.metadata.name === rawPackName) &&
            p.metadata.type === type,
        );
        if (!pack) throw e; // If we STILL can't find it, something is very wrong
      } else {
        throw e;
      }
    }
  }
  return pack;
}
