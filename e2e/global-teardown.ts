import { test as teardown } from "@playwright/test";
import { disableTour, deleteWorldIfExists } from "./helpers";

teardown("delete test world", async ({ page, baseURL }) => {
  const adminPassword = process.env.FOUNDRY_ADMIN_PASSWORD;
  const worldId = process.env.FOUNDRY_E2E_WORLD;

  if (!worldId) {
    throw new Error("FOUNDRY_E2E_WORLD must be set in .env");
  }

  // 1. Set localStorage before navigation to disable the tour
  await disableTour(page);

  await page.goto("/");

  // 2. If we are in the game, return to setup
  if (page.url().includes("/game")) {
    // Wait for the game to be ready
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    // Open Settings sidebar
    await page.getByRole("tab", { name: "Game Settings" }).click();

    // Click Return to Setup
    await page.getByRole("button", { name: "Return to Setup" }).click();

    // Confirm Return to Setup
    const confirmDialog = page.locator("dialog.dialog").filter({ hasText: "Return to Setup" });
    if ((await confirmDialog.count()) > 0) {
      await confirmDialog.getByRole("button", { name: /Yes/i }).click();
    } else {
      // Fallback for older versions or different dialog structures
      await page
        .getByRole("button", { name: /Yes/i })
        .click()
        .catch(() => null);
    }

    // Wait for redirect to setup
    await expect(page).toHaveURL(/\/setup/, { timeout: 30000 });
  }

  // 3. If we're on the setup screen or join screen, go to setup and handle login
  if (!page.url().endsWith("/setup")) {
    await page.goto("/setup");
  }

  if (page.url().endsWith("/setup")) {
    if (adminPassword) {
      await page.fill('input[name="adminPassword"]', adminPassword);
      await page.click('button[name="submit"]');
    }

    await deleteWorldIfExists(page, worldId);
  }
});
