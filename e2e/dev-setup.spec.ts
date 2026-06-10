/**
 * First-time dev world setup. Run automatically by `npm run dev:docker`
 * when foundry_data_dev/Data/worlds/<WORLD_ID> doesn't exist yet.
 */
import { test } from "@playwright/test";
import { foundrySetup } from "@thefehr/foundry-playwright";

const WORLD_ID = process.env.FOUNDRY_DEV_WORLD ?? "dev-world";
const ADMIN_PASSWORD = process.env.FOUNDRY_ADMIN_KEY ?? "admin";
const FOUNDRY_VERSION = process.env.FOUNDRY_VERSION ?? "14";
const MODULES = ["thefehrs-learning-manager", "tidy5e-sheet"];

test.setTimeout(600_000);

test("setup dev world", async ({ page }) => {
  await foundrySetup(page, {
    worldId: WORLD_ID,
    systemId: "dnd5e",
    moduleId: MODULES,
    adminPassword: ADMIN_PASSWORD,
    version: FOUNDRY_VERSION,
    createWorld: true,
    deleteIfExists: false,
  });
});
