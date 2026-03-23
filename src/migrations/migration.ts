import { Settings } from "../core/settings.js";
import { migrateToV1Relational } from "./v1-relational.js";
import { migrateV1_1GpToCp } from "./v1_1-gp-to-cp.js";
import { migrateToV1_2 } from "./v1_2-crit-rules.js";
import { migrateToV2 } from "./v2-native-items.js";
import { migrateToV2Direct } from "./v2-direct.js";

export async function migrateData() {
  if (!game.user?.isGM) return;

  let currentVersion = Settings.migrationVersion;

  // Normalize legacy integer versions > 0 to 1.2.0 so only the v2 migration runs.
  if (/^\d+$/.test(currentVersion) && currentVersion !== "0") {
    currentVersion = "1.2.0";
  }

  if (currentVersion === "0") {
    // New installation or very old version
    // Always call direct migration to ensure settings/templates are normalized
    await migrateToV2Direct();
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
}

function isNewerVersion(newer: string, current: string): boolean {
  return (foundry.utils as any).isNewerVersion(newer, current);
}
