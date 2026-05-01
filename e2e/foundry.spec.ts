import { test, expect } from "./fixtures";

test.describe("Foundry VTT Interface", () => {
  test("should load the game canvas and sidebar", async ({ page }) => {
    // Navigate to the game (already logged in via global setup)
    await page.goto("/game");

    // Verify the Foundry interface is visible
    await expect(page.locator("#interface")).toBeVisible();
    await expect(page.locator("#sidebar")).toBeVisible();

    // Check if the learning manager's main logic or UI is registered
    // (This is a generic check, you can add more specific selectors later)
    const isModuleLoaded = await page.evaluate(() => {
      // @ts-ignore
      return game.modules.get("thefehrs-learning-manager")?.active === true;
    });
    expect(isModuleLoaded).toBe(true);
  });
});
