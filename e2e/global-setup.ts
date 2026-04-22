import { test as setup, expect } from "@playwright/test";
import moduleDefinition from "../public/module.json" with { type: "json" };
import { switchTab, disableTour, deleteWorldIfExists } from "./helpers";
import fs from "fs";
import path from "path";

const gameWorldsTabHeading = "Game Worlds";
const gameSystemsTabHeading = "Game Systems";
const moduleTabHeading = "Add-on Modules";

setup("authenticate and verify module", async ({ page, baseURL }) => {
  setup.setTimeout(120000);
  const adminPassword = process.env.FOUNDRY_ADMIN_PASSWORD;
  const worldId = process.env.FOUNDRY_E2E_WORLD;
  const userName = process.env.FOUNDRY_E2E_USER;
  const password = process.env.FOUNDRY_E2E_PASSWORD;

  if (!worldId || !userName) {
    throw new Error("FOUNDRY_E2E_WORLD and FOUNDRY_E2E_USER must be set in .env");
  }

  // Ensure auth directory exists
  const authFile = "e2e/.auth/user.json";
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // 1. Set localStorage before navigation to disable the tour
  await disableTour(page);

  // 2. Navigate to baseURL
  console.log(`Navigating to baseURL: ${baseURL}`);
  await page.goto("/");

  // 3. Check if we're on the setup screen and login if needed
  if (page.url().includes("/setup")) {
    console.log("On setup screen. Checking for admin login.");
    const passwordInput = page.locator('input[name="adminPassword"]');
    if (await passwordInput.isVisible()) {
      if (!adminPassword) {
        throw new Error(
          "Foundry is locked with an admin password but FOUNDRY_ADMIN_PASSWORD is not set.",
        );
      }
      await passwordInput.fill(adminPassword);
      await page.click('button[name="submit"]');
      await page.waitForURL((url) => url.pathname.endsWith("/setup"));
    }

    console.log("Verifying required systems and modules are installed...");
    // 3.1. Verify all tabs are present
    const worldTab = page.getByRole("heading").filter({ hasText: gameWorldsTabHeading });
    const systemTab = page.getByRole("heading").filter({ hasText: gameSystemsTabHeading });
    const moduleTab = page.getByRole("heading").filter({ hasText: moduleTabHeading });
    await expect(worldTab, "Worlds tab should be visible").toBeVisible();
    await expect(systemTab, "Systems tab should be visible").toBeVisible();
    await expect(moduleTab, "Modules tab should be visible").toBeVisible();

    // 3.2. Switch to Game Systems tab and verify D&D 5e module is present
    await switchTab(page, gameSystemsTabHeading);
    const dndBox = page.getByRole("heading", { name: "Dungeons & Dragons Fifth" });
    await expect(dndBox, "D&D 5e system should be installed").toBeVisible();

    // 3.3. Switch to Add-on Modules tab and verify dependency modules are present
    await switchTab(page, moduleTabHeading);
    await expect(
      page.getByRole("heading", { name: "Tidy 5e Sheets" }),
      "Tidy 5e should be installed",
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Spotlight Omnisearch" }),
      "Spotlight Omnisearch should be installed",
    ).toBeVisible();

    // 3.4 Verify the module is present in the list
    const moduleBox = page.getByRole("heading", { name: moduleDefinition.title });
    await expect(moduleBox, `${moduleDefinition.title} should be installed`).toBeVisible();

    // 3.5. Delete the world if it already exists
    console.log(`Checking if test world "${worldId}" exists...`);
    await deleteWorldIfExists(page, worldId);

    // 3.6. Create the world
    console.log(`Creating test world "${worldId}"...`);
    await switchTab(page, gameWorldsTabHeading);
    await page.getByRole("button", { name: /Create World/ }).click();

    const createDialog = page.locator("dialog.dialog").filter({ hasText: "Create World" });
    await expect(createDialog).toBeVisible();
    await createDialog.getByRole("textbox", { name: "World Title" }).fill(worldId);
    await createDialog.getByRole("textbox", { name: "Data Path" }).fill(worldId);
    await createDialog.getByLabel("Game System").selectOption("Dungeons & Dragons Fifth Edition");
    await createDialog.getByRole("button", { name: /Create World/ }).click();

    await expect(createDialog).toBeHidden();

    // 3.7 Launch the world
    console.log(`Launching world "${worldId}"...`);
    const worldBox = page.locator(`li.package.world[data-package-id="${worldId}"]`);
    await expect(worldBox).toBeVisible();
    await worldBox.hover();
    await worldBox.locator('[data-action="worldLaunch"]').click();
  }

  // 4. Handle Join screen
  console.log("Waiting for join screen or game...");
  await page.waitForURL((url) => url.pathname.includes("/join") || url.pathname.includes("/game"), {
    timeout: 60000,
  });

  if (page.url().includes("/join")) {
    console.log(`Logging into world as "${userName}"...`);
    await page.locator('select[name="userid"]').selectOption({ label: userName });
    if (password) {
      await page.locator('input[name="password"]').fill(password);
    }
    await page.locator('button[name="join"]').click();
  }

  // 5. Wait for the game to load
  console.log("Waiting for game to be ready...");
  await expect(page).toHaveURL(/\/game/, { timeout: 60000 });
  await expect(page.locator("#loading")).toBeHidden({ timeout: 60000 });
  await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
    timeout: 60000,
  });

  // 6. Activate the module if it's not already active
  console.log("Checking if module is active...");
  const isModuleActive = await page.evaluate((id) => {
    // @ts-ignore
    return !!game.modules.get(id)?.active;
  }, moduleDefinition.id);

  if (!isModuleActive) {
    console.log(`Activating module "${moduleDefinition.id}"...`);
    // Open Settings sidebar
    await page.getByRole("tab", { name: "Game Settings" }).click();

    // Click Manage Modules
    await page.locator('[data-app="modules"]').click();

    // Check the module
    const moduleRow = page.locator(`li.package[data-module-id="${moduleDefinition.id}"]`);
    await moduleRow.locator('input[type="checkbox"]').click();

    // Handle Dependency Resolution dialog if it appears
    const dependencyDialog = page
      .locator("dialog.dialog")
      .filter({ hasText: "Dependency Resolution" });
    await dependencyDialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => null);

    if (await dependencyDialog.isVisible()) {
      await dependencyDialog.getByRole("button", { name: "Activate" }).click();
    }

    // Save settings
    await page.getByRole("button", { name: "Save Module Settings" }).click();

    // Confirm reload
    const reloadDialog = page.locator("dialog.dialog").filter({ hasText: "Reload Application?" });
    await reloadDialog.getByRole("button", { name: /Yes/i }).click();

    // Wait for reload
    console.log("Waiting for reload...");
    await page.waitForURL(/\/game/, { timeout: 30000 });
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });
  }

  console.log("Setup complete. Saving storage state.");
  await page.context().storageState({ path: authFile });
});
