import { MODULE_ID } from "@/global.js";
import { getGame } from "@/core/foundry.js";

export type MigrationSettingKey =
  | "guidanceTiers"
  | "allowedCompendiums"
  | "teacherCompendiums"
  | "bookCompendiums";

/**
 * Registers migration-related settings.
 * This is split from migration.ts and migration-utils.ts to avoid circular dependencies.
 */
export function registerMigrationSettings() {
  const game = getGame();
  const settings: MigrationSettingKey[] = [
    "guidanceTiers",
    "allowedCompendiums",
    "teacherCompendiums",
    "bookCompendiums",
  ];

  for (const setting of settings) {
    if (!game.settings.settings.has(`${MODULE_ID}.${setting}`)) {
      game.settings.register(MODULE_ID, setting, {
        scope: "world",
        config: false,
        type: Array,
        default: [],
      });
    }
  }
}
