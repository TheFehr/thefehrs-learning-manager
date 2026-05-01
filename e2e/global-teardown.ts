import { test as teardown, expect } from "@playwright/test";
import { disableTour, deleteWorldIfExists, returnToSetup } from "./helpers";

teardown("delete test world", async ({ page, baseURL }) => {
  const adminPassword = process.env.FOUNDRY_ADMIN_PASSWORD;
  const worldId = process.env.FOUNDRY_E2E_WORLD;

  if (!worldId) {
    throw new Error("FOUNDRY_E2E_WORLD must be set in .env");
  }

  // 1. Set localStorage before navigation to disable the tour
  await disableTour(page);

  // 2. Navigate to root and ensure we are on the setup page
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await returnToSetup(page, adminPassword);

  // 3. If we're on the setup screen handle login (sometimes it's a form on /setup itself)
  if (page.url().includes("/setup")) {
    const passwordInput = page.locator('input[name="adminPassword"]');
    if (await passwordInput.isVisible()) {
      if (adminPassword) {
        await passwordInput.fill(adminPassword);
        await page.click('button[name="submit"]');
        await page.waitForURL((url) => url.pathname.endsWith("/setup"));
      }
    }

    await deleteWorldIfExists(page, worldId);
  }
});
