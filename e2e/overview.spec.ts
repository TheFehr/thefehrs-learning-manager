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

test.describe("Project Overview UI", () => {
  test("verify invalid projects are listed", async ({ page }) => {
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
    await waitForReady(page);

    const moduleId = "thefehrs-learning-manager";

    // 0. Setup: Create a compendium with an invalid project
    await page.evaluate(async (moduleId) => {
      const packId = "world.test-learning-feats";
      let pack = (game as any).packs.get(packId);
      if (pack) await pack.deleteCompendium();

      // @ts-ignore
      await foundry.documents.collections.CompendiumCollection.createCompendium({
        type: "Item",
        label: "Test Learning Feats",
        name: "test-learning-feats",
        package: "world",
      });
      pack = (game as any).packs.get(packId);

      await Item.create(
        {
          name: "Invalid Project",
          type: "feat",
          system: {
            description: { value: "" },
            type: { value: "feat" },
            activities: {},
          },
          flags: {
            [moduleId]: {
              isLearningProject: true,
              projectData: { target: 0, requirements: [] },
            },
          },
        },
        { pack: packId },
      );

      await (game as any).settings.set(moduleId, "allowedCompendiums", [packId]);
    }, moduleId);

    // 1. Open the Overview app via the registered menu API
    await page.evaluate(async () => {
      const moduleId = "thefehrs-learning-manager";
      const menuKey = `${moduleId}.overviewMenu`;

      // @ts-ignore
      const menu = game.settings.menus.get(menuKey);
      if (!menu) throw new Error(`Overview menu "${menuKey}" not found`);
      const app = new menu.type();
      app.render(true);
    });

    // 2. Verify the Project Overview dialog is open
    await expect(page.getByText("Invalid Learning Projects")).toBeVisible({
      timeout: 15000,
    });

    // 3. Verify the "Invalid Project" from the compendium is listed
    const invalidItemRow = page
      .locator(".invalid-project-card")
      .filter({ has: page.locator(".project-name").filter({ hasText: "Invalid Project" }) });
    await expect(invalidItemRow).toBeVisible({ timeout: 15000 });

    // 5. Verify the reasons for invalidity are shown
    await expect(invalidItemRow).toContainText("Missing or invalid project target");
    await expect(invalidItemRow).toContainText("Project description is missing or empty");
    await expect(invalidItemRow).toContainText("Project has neither activities nor effects");

    // 6. Verify the pack name is correct
    await expect(invalidItemRow).toContainText("Test Learning Feats");
  });
});
