import { Settings } from "../core/settings";
import { migrateToV1 } from "./v1-relational";
import { migrateToV1_1 } from "./v1_1-gp-to-cp";
import { migrateToV1_2 } from "./v1_2-crit-rules";
import { migrateToV2 } from "./v2-native-items";
import { migrateToV2Direct } from "./v2-direct";

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

  // v1: Relational Schema (0 -> 1.0.0)
  if (!isNewerVersion(version, 0) && isNewerVersion("1.0.0", version)) {
    await migrateToV1();
    version = "1.0.0";
  }

  // v1.1: GP to CP costs (1.0.0 -> 1.1.0)
  if (!isNewerVersion(version, "1.0.0") && isNewerVersion("1.1.0", version)) {
    await migrateToV1_1();
    version = "1.1.0";
  }

  // v1.2: Default Crit Rules (1.1.0 -> 1.2.0)
  if (!isNewerVersion(version, "1.1.0") && isNewerVersion("1.2.0", version)) {
    await migrateToV1_2();
    version = "1.2.0";
  }

  // 2.0.0: Native Items & Template-less Model (1.2.0 -> 2.0.0)
  if (!isNewerVersion(version, "1.2.0") && isNewerVersion("2.0.0", version)) {
    await migrateToV2();
  }
}
