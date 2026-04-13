import { ActorProxy } from "@/logic/actor-proxy.js";
import { isActor5e } from "@/types.js";
import type { Actor5e } from "@/types.js";
import { TutelageResolverService } from "@/logic/tutelage-resolver.js";
import { ProjectItem } from "@/logic/project-item.js";
import { Settings } from "./settings.js";
import { getAvailablePacks } from "@/logic/settings-logic.js";
import { Logger } from "./logger.js";

function resolveControlledActor(): Actor5e | undefined {
  if (typeof canvas === "undefined" || !canvas?.ready) return undefined;

  let actor = game.user?.character;

  // Fallback to selected token
  const controlledTokens = (canvas as any).tokens?.controlled;
  if (!actor && controlledTokens && controlledTokens.length > 0) {
    actor = controlledTokens[0].actor ?? undefined;
  }

  return isActor5e(actor) ? actor : undefined;
}

/**
 * Global helpers for debugging and "cheating" during development.
 * Available as `ude` in the browser console.
 */
export const DebugHelpers = {
  /**
   * Add a specific amount of training hours to the currently controlled character.
   * @param hours - The amount of hours to add. Supports negative values.
   */
  async addTime(hours: number) {
    const validatedHours = Number(hours);
    if (!Number.isFinite(validatedHours)) {
      const msg = `Invalid hours: ${hours}. Must be a finite number.`;
      Logger.warn(msg);
      return;
    }

    const actor = resolveControlledActor();

    if (!actor) {
      Logger.warn("No character controlled or token selected.");
      return;
    }

    const proxy = ActorProxy.forActor(actor);
    const bank = proxy.bank;
    const newTotal = Math.max(0, (bank.total || 0) + validatedHours);
    const diff = newTotal - (bank.total || 0);

    if (diff === 0 && validatedHours !== 0) {
      Logger.warn("Bank already empty, cannot remove more time.");
      return;
    }

    await proxy.setBank({ total: newTotal });
    const action = diff >= 0 ? "Added" : "Removed";
    const absDiff = Math.abs(diff);

    Logger.info(`${action} ${absDiff}h to ${actor.name}'s bank. New total: ${newTotal}h`, true, {
      previous: bank.total,
      change: validatedHours,
      actualDiff: diff,
      newTotal,
    });
  },

  /**
   * Add a specific amount of gold to the currently controlled character.
   * @param gp - The amount of GP to add. Supports negative values.
   */
  async addGP(gp: number) {
    const validatedGP = Number(gp);
    if (!Number.isFinite(validatedGP)) {
      const msg = `Invalid gp: ${gp}. Must be a finite number.`;
      Logger.warn(msg);
      return;
    }

    const actor = resolveControlledActor();

    if (!actor) {
      Logger.warn("No character controlled or token selected.");
      return;
    }

    const proxy = ActorProxy.forActor(actor);
    const current = proxy.currency;
    const newGP = Math.max(0, (current.gp || 0) + validatedGP);
    const diff = newGP - (current.gp || 0);

    if (diff === 0 && validatedGP !== 0) {
      Logger.warn("No GP available to remove.");
      return;
    }

    const action = diff >= 0 ? "Added" : "Removed";
    const absDiff = Math.abs(diff);

    await proxy.updateCurrency({
      ...current,
      gp: newGP,
    });

    Logger.info(`${action} ${absDiff}gp to ${actor.name}. New total: ${newGP}gp`, true, {
      previous: current.gp,
      change: validatedGP,
      actualDiff: diff,
      newTotal: newGP,
    });
  },

  /**
   * Clear the instructor and book cache.
   */
  clearCache() {
    TutelageResolverService.clearCache();
    Logger.info("Tutelage cache cleared.", true);
  },

  /**
   * Get the current instructor cache.
   */
  getCache() {
    const cache = TutelageResolverService.getCache();
    if (!cache) return null;
    return {
      size: cache.length,
      instructors: cache.map((i) => ({
        actorUuid: i.actorUuid,
        actorName: i.name,
        offeringName: i.offering.name,
        modifier: i.offering.modifier,
        categories: i.offering.categories,
      })),
    };
  },

  /**
   * Refresh the instructor cache.
   */
  async refreshCache() {
    await TutelageResolverService.refreshCache();
    return this.getCache();
  },

  /**
   * Get the current tutelage configuration.
   */
  getConfig() {
    return {
      teacherCompendiums: Settings.get("teacherCompendiums"),
      bookCompendiums: Settings.get("bookCompendiums"),
    };
  },

  /**
   * Find all compendiums that contain relevant tutelage data.
   */
  async findFittingCompendiums() {
    const actors = await getAvailablePacks("Actor", "teacherOfferings");
    const items = await getAvailablePacks("Item", "learningBookBonus");
    return {
      instructors: actors.filter((p) => p.isFitting),
      books: items.filter((p) => p.isFitting),
    };
  },

  /**
   * Test instructor filtering for a specific project by UUID.
   */
  async testInstructorsByUuid(itemUuid: string) {
    const item = await fromUuid(itemUuid as any);
    if (!item || !(item instanceof Item)) {
      Logger.warn(`Item not found or invalid: ${itemUuid}`);
      return [];
    }

    // Verify item has project data before treating as ProjectItem
    const hasProjectData = (item as any).getFlag?.("thefehrs-learning-manager", "projectData");
    if (!hasProjectData) {
      Logger.warn(`Item "${item.name}" is not a learning project.`);
      return [];
    }

    return await TutelageResolverService.getAvailableInstructors(item as any as ProjectItem);
  },

  /**
   * Run the migration logic.
   */
  async runMigration() {
    const { migrateData } = await import("@/migrations/migration.js");
    await migrateData();
  },

  /**
   * Reset the migration version and rerun migration.
   * @param version - The version to reset to (default: "0").
   */
  async resetMigration(version = "0") {
    await Settings.set("migrationVersion", version);
    Logger.info(`Migration version reset to ${version}. Rerunning migration...`, true);
    await this.runMigration();
  },
};

/**
 * Initialize debug helpers on the window object.
 */
export function initDebugHelpers() {
  Hooks.once("ready", () => {
    if (import.meta.env.DEV || game?.user?.isGM) {
      // ude = User Downtime Engine - short and easy to type in console
      // We use ude to avoid naming collisions with common global variables
      // and to make it discoverable
      (window as unknown as { ude: typeof DebugHelpers }).ude = DebugHelpers;
      Logger.debug("Debug helpers initialized. Use `ude.addTime(hours)` in the console.");
    }
  });
}
