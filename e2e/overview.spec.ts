import { test, expect } from "@playwright/test";

test.describe("Project Overview UI", () => {
  test("verify invalid projects are listed", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/game");

    // Wait for game to be ready
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    // 1. Open the Overview app via the registered menu API
    await page.evaluate(async () => {
      const moduleId = "thefehrs-learning-manager";
      const menuKey = `${moduleId}.overviewMenu`;

      // Poll for menu registration
      let menu = null;
      for (let i = 0; i < 20; i++) {
        // @ts-ignore
        menu = game.settings.menus.get(menuKey);
        if (menu) break;
        await new Promise((r) => setTimeout(r, 500));
      }

      if (!menu) throw new Error(`Overview menu "${menuKey}" not found after polling`);
      const app = new menu.type();
      app.render(true);
    });

    // 2. Verify the Project Overview dialog is open
    await expect(page.getByText("Invalid Learning Projects")).toBeVisible({
      timeout: 15000,
    });

    // 3. Verify the "Invalid Project" from the compendium is listed
    // It takes time to scan compendiums
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
