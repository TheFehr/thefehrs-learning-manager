import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-overview",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

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
  },
});

test.describe("Project Overview UI", () => {
  test("verify invalid projects are listed", async ({ page }) => {
    await page.evaluate(async () => {
      const moduleId = "thefehrs-learning-manager";
      const menuKey = `${moduleId}.overviewMenu`;
      // @ts-ignore
      const menu = game.settings.menus.get(menuKey);
      if (!menu) throw new Error(`Overview menu "${menuKey}" not found`);
      const app = new menu.type();
      app.render(true);
    });

    await expect(page.getByText("Invalid Learning Projects")).toBeVisible({ timeout: 15000 });

    const invalidItemRow = page
      .locator(".invalid-project-card")
      .filter({ has: page.locator(".project-name").filter({ hasText: "Invalid Project" }) });
    await expect(invalidItemRow).toBeVisible({ timeout: 15000 });

    await expect(invalidItemRow).toContainText("Missing or invalid project target");
    await expect(invalidItemRow).toContainText("Project description is missing or empty");
    await expect(invalidItemRow).toContainText("Project has neither activities nor effects");
    await expect(invalidItemRow).toContainText("Test Learning Feats");
  });
});
