import {
  test,
  expect,
  useFoundry,
  waitForReady,
  loginAs,
  disableTour,
} from "@thefehr/foundry-playwright";

useFoundry(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  deleteIfExists: true,
});

test.describe("Foundry VTT Interface", () => {
  test("should load the game canvas and sidebar", async ({ page }) => {
    console.log("Navigating to /game...");
    await page.goto("/game");
    await loginAs(page, "Gamemaster");
    await disableTour(page);
    await page.evaluate(() => {
      const tourElements = document.querySelectorAll(
        ".tour, .tour-overlay, .tour-center-step, .tour-step-anchor, aside.tour",
      );
      tourElements.forEach((el) => (el as HTMLElement).remove());
      document.body.classList.remove("tour-open");
    });
    console.log("Current URL:", page.url());

    // Wait for the game to be ready
    await waitForReady(page);

    // Wait for the game to be ready
    await waitForReady(page);

    // Verify the Foundry interface is visible
    await expect(page.locator("#interface")).toBeVisible();
    await expect(page.locator("#sidebar")).toBeVisible();

    // Check if the learning manager's main logic or UI is registered
    const isModuleLoaded = await page.evaluate(() => {
      // @ts-ignore
      return game.modules.get("thefehrs-learning-manager")?.active === true;
    });
    expect(isModuleLoaded).toBe(true);
  });
});
