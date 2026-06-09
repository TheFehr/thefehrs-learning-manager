/**
 * Starts a Foundry VTT Docker container for local development, then spawns
 * the Vite dev server pointing at it.
 *
 * First run: installs dnd5e + tidy5e-sheet, creates the dev world (takes ~2-3 min).
 * Subsequent runs: world already exists in the persistent data dir — skips setup, starts immediately.
 * Reset: delete foundry_data_dev/ to force a clean first-run again.
 *
 * Usage:  npm run dev:docker
 * Env overrides (in .env):
 *   FOUNDRY_VERSION      Foundry major version (default: "14")
 *   FOUNDRY_DEV_PORT     Host port the container binds to (default: 30003)
 *   FOUNDRY_DEV_WORLD    World ID to create/reuse (default: "dev-world")
 */

import { DockerFoundryOrchestrator } from "@thefehr/foundry-playwright";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const FOUNDRY_VERSION = process.env.FOUNDRY_VERSION ?? "14";
const DEV_PORT = parseInt(process.env.FOUNDRY_DEV_PORT ?? "30003", 10);
const WORLD_ID = process.env.FOUNDRY_DEV_WORLD ?? "dev-world";
const MODULE_ID = "thefehrs-learning-manager";

const orchestrator = new DockerFoundryOrchestrator({
  version: FOUNDRY_VERSION,
  port: DEV_PORT,
  containerName: "foundry-dev",
  dataDir: "./foundry_data_dev",
  cacheDir: "./.foundry_cache",
});

let vite;

async function shutdown(signal) {
  console.log(`\n[dev-docker] ${signal} received — shutting down…`);
  vite?.kill();
  orchestrator.stopAndRemove();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Copy public/ (module.json + static assets) into the data dir so Foundry
// recognises the module as installed. main.js / main.css are served by Vite.
const moduleDestDir = path.resolve(`foundry_data_dev/Data/modules/${MODULE_ID}`);
fs.mkdirSync(moduleDestDir, { recursive: true });
fs.cpSync(path.resolve("public"), moduleDestDir, { recursive: true });
// Stub the built assets so Foundry's file-existence check passes at startup.
// In the browser these paths are intercepted by the Vite proxy.
fs.writeFileSync(path.join(moduleDestDir, "main.js"), "// dev stub\n");
fs.writeFileSync(path.join(moduleDestDir, "main.css"), "/* dev stub */\n");
console.log(`[dev-docker] Module assets injected → ${moduleDestDir}`);

const foundryUrl = await orchestrator.start();
console.log(`[dev-docker] Foundry ready at ${foundryUrl}`);

// First-run world setup. The world dir persists in foundry_data_dev/ across
// container restarts, so this block only runs once per data directory.
const worldDataPath = path.resolve(`foundry_data_dev/Data/worlds/${WORLD_ID}`);
if (!fs.existsSync(worldDataPath)) {
  console.log("[dev-docker] No dev world found — running first-time setup (~5 min)…");

  // Run via the Playwright test runner so playwright.config.ts supplies the
  // correct viewport (1920×1080), actionTimeout (120s), and executablePath.
  execSync(`npx playwright test e2e/dev-setup.spec.ts --project=chromium`, {
    stdio: "inherit",
    env: {
      ...process.env,
      FOUNDRY_URL: foundryUrl,
      FOUNDRY_VERSION,
      FOUNDRY_DEV_WORLD: WORLD_ID,
    },
  });

  console.log("[dev-docker] First-time setup complete — skipped on future runs.");
} else {
  console.log(`[dev-docker] Dev world found at ${worldDataPath} — skipping setup.`);
}

console.log(`[dev-docker] Open http://localhost:30004 in your browser.`);

vite = spawn("npx", ["vite"], {
  stdio: "inherit",
  env: { ...process.env, FOUNDRY_URL: foundryUrl },
});

vite.on("close", (code) => {
  orchestrator.stopAndRemove();
  process.exit(code ?? 0);
});
