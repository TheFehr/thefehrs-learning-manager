import { Settings } from "@/core/settings.js";
import { MODULE_ID } from "@/global.js";
import { Logger } from "@/core/logger.js";
import { FoundryUtils } from "@/core/foundry-utils.js";
import type { TeacherOffering, LearningBookBonus, Actor5e, ProjectItem } from "@/types.js";
import { getGame } from "@/core/foundry.js";

export interface InstructorInstance {
  actorUuid: string;
  name: string;
  offering: TeacherOffering;
}

export class TutelageResolverService {
  private static instructorCache: InstructorInstance[] | null = null;

  /**
   * Clears the instructor cache.
   */
  static clearCache() {
    this.instructorCache = null;
  }

  /**
   * Returns the current instructor cache.
   */
  static getCache() {
    return this.instructorCache;
  }

  /**
   * Scans configured compendiums for actors with teacher flags.
   */
  static async getAvailableInstructors(projectItem: ProjectItem): Promise<InstructorInstance[]> {
    if (!this.instructorCache) {
      Logger.debug("Instructor cache is null, refreshing...");
      await this.refreshCache();
    }

    if (!this.instructorCache || this.instructorCache.length === 0) {
      Logger.debug(
        `No instructors in cache. Cache is ${this.instructorCache === null ? "null" : "empty"}.`,
      );
      return [];
    }

    const projectName = projectItem.name;
    const projectCats = projectItem.getFlag(MODULE_ID, "projectData")?.categories || [];

    Logger.debug(
      `Filtering ${this.instructorCache.length} instructors for project: "${projectName}", categories: ${projectCats.join(", ")}`,
    );

    const result = this.instructorCache.filter((instructor) => {
      const instructorCats = instructor.offering.categories || [];
      const hasCategoryList = instructorCats.length > 0;

      // Match all if no categories specified, otherwise match any category
      const isApplicable = !hasCategoryList || projectCats.some((c) => instructorCats.includes(c));

      if (isApplicable) {
        Logger.debug(
          `Instructor ${instructor.name} (${instructor.offering.name}) matches project.`,
        );
      }

      return isApplicable;
    });

    Logger.debug(`Found ${result.length} applicable instructors.`);
    return result;
  }

  /**
   * Refreshes the global instructor cache by scanning configured compendiums.
   */
  static async refreshCache() {
    Logger.debug("Refreshing instructor cache...");
    const compendiumIds = Settings.get("teacherCompendiums") || [];
    const instructors: InstructorInstance[] = [];

    for (const id of compendiumIds) {
      try {
        const pack = getGame().packs?.get(id);
        if (!pack) {
          Logger.warn(`Compendium ${id} not found.`);
          continue;
        }
        if (pack.metadata.type !== "Actor") {
          Logger.warn(`Compendium ${id} is not an Actor compendium (type: ${pack.metadata.type}).`);
          continue;
        }

        const flagPath = `flags.${MODULE_ID}.teacherOfferings`;
        const index = await (pack as any).getIndex({ fields: [flagPath] });
        Logger.debug(`Scanning compendium ${id}, found ${index.size || index.length} entries.`);

        for (const entry of index) {
          const offerings = (FoundryUtils.getProperty(entry, flagPath) ||
            (entry as any)[flagPath]) as TeacherOffering[];
          if (offerings && Array.isArray(offerings)) {
            Logger.debug(
              `Found ${offerings.length} offerings on actor ${entry.name} (${entry._id})`,
            );
            for (const offering of offerings) {
              instructors.push({
                actorUuid:
                  entry.uuid ||
                  (pack as any).getUuid(entry._id) ||
                  `Compendium.${pack.metadata.id}.Actor.${entry._id}`,
                name: entry.name,
                offering: offering,
              });
            }
          }
        }
      } catch (err) {
        Logger.error(`Failed to process compendium ${id}:`, true, err);
      }
    }

    this.instructorCache = instructors;
    Logger.debug(`Instructor cache refreshed with ${instructors.length} offerings.`);
  }

  /**
   * Scans actor inventory for items with book flags.
   */
  static getAvailableBooks(
    actor: Actor5e,
    projectItem: ProjectItem,
  ): { name: string; modifier: number }[] {
    const projectCats = projectItem.getFlag(MODULE_ID, "projectData")?.categories || [];
    const books: { name: string; modifier: number }[] = [];

    const items = actor.items as any;
    const bookCompendiums = Settings.get("bookCompendiums") || [];

    for (const item of items) {
      // Filter by compendium if configured
      if (bookCompendiums.length > 0) {
        const sourceId = (item._stats?.compendiumSource || (item as any).flags?.core?.sourceId) as
          | string
          | undefined;
        if (!sourceId || !sourceId.startsWith("Compendium.")) continue;
        const parts = sourceId.split(".");
        if (parts.length < 3) continue;
        const packId = `${parts[1]}.${parts[2]}`;
        if (!bookCompendiums.includes(packId)) continue;
      }

      const bonus = item.getFlag(MODULE_ID, "learningBookBonus") as LearningBookBonus;
      if (bonus) {
        const bookCats = bonus.categories || [];
        const hasCategoryList = bookCats.length > 0;

        // Match all if no categories specified, otherwise match any category
        const isApplicable = !hasCategoryList || projectCats.some((c) => bookCats.includes(c));

        if (isApplicable) {
          books.push({
            name: item.name,
            modifier: bonus.modifier,
          });
        }
      }
    }

    return books;
  }

  /**
   * Resolves final tutelage modifier and cost.
   */
  static async resolveTutelage(
    actor: Actor5e,
    projectItem: ProjectItem,
    selectedInstructorId?: string, // actorUuid of instructor
    selectedInstructorName?: string, // name of offering
  ): Promise<{ modifier: number; costs: Record<string, number>; instructorName: string }> {
    const books = this.getAvailableBooks(actor, projectItem);
    const bestBookMod = books.reduce((max, b) => Math.max(max, b.modifier), 0);

    let instructorMod = 0;
    let instructorCosts: Record<string, number> = {};
    let instructorName = "Self-Study";

    if (selectedInstructorId) {
      const availableInstructors = await this.getAvailableInstructors(projectItem);
      const instructor = availableInstructors.find(
        (i) => i.actorUuid === selectedInstructorId && i.offering.name === selectedInstructorName,
      );
      if (instructor) {
        instructorMod = instructor.offering.modifier;
        instructorCosts = instructor.offering.costs;
        instructorName = instructor.offering.name;
      }
    }

    return {
      modifier: Math.max(instructorMod, bestBookMod),
      costs: instructorCosts,
      instructorName: instructorName,
    };
  }
}
