import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { waitForGameReady } from "./utils";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-foundry",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);
  },
});

test.describe("Foundry VTT Interface", () => {
  test("should load the game canvas and sidebar", async ({ page }) => {
    await expect(page.locator("#interface")).toBeVisible();
    await expect(page.locator("#sidebar")).toBeVisible();

    const isModuleLoaded = await page.evaluate(() => {
      return game.modules.get("thefehrs-learning-manager")?.active === true;
    });
    expect(isModuleLoaded).toBe(true);
  });
});
