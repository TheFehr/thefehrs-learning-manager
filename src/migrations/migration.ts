import { migrateToV1Relational } from "./v1-relational.js";
import { migrateV1_1GpToCp } from "./v1_1-gp-to-cp.js";
import { migrateToV1_2 } from "./v1_2-crit-rules.js";
import { migrateToV2 } from "./v2-native-items.js";
import { migrateToV2Direct } from "./v2-direct.js";
import { migrateToV2_1, migrateToV2_1_1 } from "./v2_1-flexible-methods.js";
import { migrateToV3 } from "./v3-tutelage-selection.js";
import { MODULE_ID } from "@/global.js";
import { Logger } from "@/core/logger.js";
import { FoundryUtils } from "@/core/foundry-utils.js";
import { getGame, getUI } from "@/core/foundry.js";

export async function migrateData() {
  const game = getGame();
  if (!game.user?.isGM) return;

  try {
    const raw = game.settings.get(MODULE_ID, "migrationVersion");
    let currentVersion: string;
    if (typeof raw === "string") {
      currentVersion = raw;
    } else if (typeof raw === "number") {
      currentVersion = String(raw);
    } else {
      currentVersion = "0";
    }

    // Normalize legacy integer versions > 0 to 1.2.0 so only the v2 migration runs.
    if (/^\d+$/.test(currentVersion) && currentVersion !== "0") {
      currentVersion = "1.2.0";
    }

    if (currentVersion === "0") {
      // New installation or very old version
      // Always call direct migration to ensure settings/templates are normalized
      await migrateToV2Direct();
      await migrateToV2_1();
      await migrateToV2_1_1();
      return;
    }

    if (isNewerVersion("1.1.0", currentVersion)) {
      await migrateToV1Relational();
      await migrateV1_1GpToCp();
    }

    if (isNewerVersion("1.2.0", currentVersion)) {
      await migrateToV1_2();
    }

    if (isNewerVersion("2.0.0", currentVersion)) {
      await migrateToV2();
    }

    if (isNewerVersion("2.1.0", currentVersion)) {
      await migrateToV2_1();
    }

    if (isNewerVersion("2.1.1", currentVersion)) {
      await migrateToV2_1_1();
    }

    if (isNewerVersion("3.0.0", currentVersion)) {
      await migrateToV3();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    Logger.error("Migration failed:", err);
    getUI().notifications?.error(
      `Downtime Engine | Migration failed: ${msg}. See console for details.`,
    );
    throw err;
  }
}

function isNewerVersion(newer: string, current: string): boolean {
  return FoundryUtils.isNewerVersion(newer, current);
}
