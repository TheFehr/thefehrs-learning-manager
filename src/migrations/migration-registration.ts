import { MODULE_ID } from "@/global.js";
import { getGame } from "@/core/foundry.js";

/**
 * Registers migration-related settings.
 * This is split from migration.ts and migration-utils.ts to avoid circular dependencies.
 */
export function registerMigrationSettings() {
  const game = getGame();
  if (!game.settings.settings.has(`${MODULE_ID}.guidanceTiers`)) {
    game.settings.register(MODULE_ID, "guidanceTiers", {
      scope: "world",
      config: false,
      type: Array,
      default: [],
    });
  }
  if (!game.settings.settings.has(`${MODULE_ID}.allowedCompendiums`)) {
    game.settings.register(MODULE_ID, "allowedCompendiums", {
      scope: "world",
      config: false,
      type: Array,
      default: [],
    });
  }
  if (!game.settings.settings.has(`${MODULE_ID}.teacherCompendiums`)) {
    game.settings.register(MODULE_ID, "teacherCompendiums", {
      scope: "world",
      config: false,
      type: Array,
      default: [],
    });
  }
  if (!game.settings.settings.has(`${MODULE_ID}.bookCompendiums`)) {
    game.settings.register(MODULE_ID, "bookCompendiums", {
      scope: "world",
      config: false,
      type: Array,
      default: [],
    });
  }
}
