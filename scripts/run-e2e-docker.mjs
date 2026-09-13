#!/usr/bin/env node
// Runs the Docker-based e2e suite programmatically against
// DockerFoundryOrchestrator directly, instead of shelling out to
// `foundry-playwright test --docker`. Needed specifically for
// buildRunArgs (foundry-playwright#110/#111): that hook is a function, so
// it can't be expressed as a CLI flag or env var, and the public CLI
// doesn't expose it - only the library API does. Everything else here
// (module auto-injection, env vars, cleanup/exit-code handling) mirrors
// what the CLI's own --docker action does, since that behavior itself
// isn't being changed, only how the container gets networked.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { DockerFoundryOrchestrator } from "@thefehr/foundry-playwright";

// DockerFoundryOrchestrator.start() (below) needs FOUNDRY_USERNAME/PASSWORD
// before Playwright even runs, so this can't rely on playwright.config.ts's
// own dotenv.config() call - that only takes effect once the Playwright
// process (inside run-playwright-docker.sh's container) starts, well after
// the Foundry container this script starts first would already have failed.
dotenv.config();

const version = process.env.FOUNDRY_VERSION || "13";
const system = process.env.FOUNDRY_SYSTEM_ID || "dnd5e";

// Shared network so the Playwright-in-Docker runner (run-playwright-docker.sh)
// can reach Foundry by container name directly, instead of --network=host
// (exposes every other host-bound service to candidate-controlled test
// code) or the published host port (extra userspace-routing latency under
// rootless Podman's pasta - see foundry-playwright#110). Fixed name, not
// per-run unique: this pipeline is already single-flight (flock-protected
// upstream), and podman/docker network create is idempotent with --ignore.
const NETWORK_NAME = "foundry-e2e-net";
const CONTAINER_NAME = `foundry-playwright-e2e-${version}`;

const tmpDataDir = path.join(
  process.cwd(),
  ".foundry_test_data",
  `.foundry_data_tmp_${Date.now()}`,
);

// Auto-inject local modules from e2e/, matching the CLI's --docker action -
// this repo relies on that default behavior (e2e/thefehrs-learning-manager/
// has its own module.json), not the CLI's --module-dir option.
const e2ePath = path.join(process.cwd(), "e2e");
if (fs.existsSync(e2ePath)) {
  for (const item of fs.readdirSync(e2ePath)) {
    const itemPath = path.join(e2ePath, item);
    if (fs.statSync(itemPath).isDirectory() && fs.existsSync(path.join(itemPath, "module.json"))) {
      const modulesDir = path.join(tmpDataDir, "Data", "modules", item);
      fs.mkdirSync(modulesDir, { recursive: true });
      fs.cpSync(itemPath, modulesDir, { recursive: true });
    }
  }
}

// --ignore (no-op if it already exists) is Podman-specific; real Docker's
// `network create` has no equivalent flag and just errors on a duplicate
// name - check first instead, portable across both.
try {
  execFileSync("docker", ["network", "inspect", NETWORK_NAME], { stdio: "ignore" });
} catch {
  execFileSync("docker", ["network", "create", NETWORK_NAME]);
}

const orchestrator = new DockerFoundryOrchestrator({
  version,
  dataDir: tmpDataDir,
  containerName: CONTAINER_NAME,
  rootless: process.env.FOUNDRY_PLAYWRIGHT_ROOTLESS === "1",
  // Adds --network alongside the orchestrator's own defaults (--user,
  // --userns=keep-id, -p, etc.) rather than replacing them - --name/-p
  // stay exactly what containerName/port above already set, so no
  // onRunArgsChanged companion is needed (see foundry-playwright's own
  // docs on that option for why it's only required when --name/-p change).
  buildRunArgs: (args) => [...args.slice(0, -1), "--network", NETWORK_NAME, args.at(-1)],
});

try {
  await orchestrator.start();

  process.env.FOUNDRY_VERSION = version;
  process.env.FOUNDRY_SYSTEM_ID = system;
  // The container-name-based URL, not the http://127.0.0.1:<port> orchestrator.start()
  // returns - that one's for host-side reachability, but run-playwright-docker.sh
  // now joins NETWORK_NAME itself and reaches Foundry by its internal port
  // (always 30000 inside the container, regardless of the published host port).
  process.env.FOUNDRY_URL = `http://${CONTAINER_NAME}:30000`;
  process.env.FOUNDRY_E2E_NETWORK = NETWORK_NAME;

  execFileSync("bash", ["scripts/run-playwright-docker.sh"], {
    stdio: "inherit",
    env: process.env,
  });
} catch (error) {
  console.error(`Error: ${error.message}`);
  // Not process.exit() - see foundry-playwright#92 for the exact bug this
  // avoids: it terminates immediately and skips the cleanup below.
  process.exitCode = 1;
} finally {
  let cleanupFailed = false;
  try {
    orchestrator.stopAndRemove();
  } catch (e) {
    cleanupFailed = true;
    console.error(
      `[run-e2e-docker] Failed to clean up the Docker container: ${e.message}. Retaining ${tmpDataDir} for inspection.`,
    );
  }
  if (!cleanupFailed) {
    console.log(`[run-e2e-docker] Cleaning up temporary data directory: ${tmpDataDir}`);
    try {
      fs.rmSync(tmpDataDir, { recursive: true, force: true });
    } catch (e) {
      console.error(
        `[run-e2e-docker] Failed to remove temporary data directory ${tmpDataDir}: ${e.message}`,
      );
    }
  }
  // Best-effort: never let network cleanup itself change the exit code -
  // a network another concurrent run still needs (this pipeline is
  // single-flight, but a manual local run happening at the same time
  // is still possible) must not fail the whole script over that.
  try {
    execFileSync("docker", ["network", "rm", NETWORK_NAME]);
  } catch {
    // ignore - either still in use or already gone
  }
}
