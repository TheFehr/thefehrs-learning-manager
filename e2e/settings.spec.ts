import { test, expect } from "./fixtures";

test.describe("Settings UI", () => {
  test("configure compendiums via UI and verify save", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/game");

    // Wait for game to be ready
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    // 1. Ensure settings are registered
    await page.evaluate(() => {
      const moduleId = "thefehrs-learning-manager";
      const requiredSettings = [
        "allowedCompendiums",
        "teacherCompendiums",
        "bookCompendiums",
        "rules",
        "timeUnits",
      ];
      const missing = requiredSettings.filter(
        (key) => !(game as any).settings.settings.has(`${moduleId}.${key}`),
      );
      if (missing.length > 0) {
        throw new Error(`Failed to initialize settings. Missing: ${missing.join(", ")}`);
      }
    });

    // Wait for compendiums to be indexed
    await page.waitForFunction(
      () => {
        const packs = (game as any).packs;
        return (
          packs.has("world.test-learning-feats") &&
          packs.has("world.test-teachers") &&
          packs.has("world.test-learning-books")
        );
      },
      { timeout: 30000 },
    );

    // 2. Open the Settings app via the menu
    await page.evaluate(() => {
      const moduleId = "thefehrs-learning-manager";
      // @ts-ignore
      const menu = game.settings.menus.get(`${moduleId}.configMenu`);
      if (!menu) throw new Error("Config menu not found");
      const app = new menu.type();
      app.render(true);
    });

    // 3. Verify the Settings dialog is open
    const settingsDialog = page.locator(".thefehrs-settings");
    await expect(settingsDialog).toBeVisible({ timeout: 15000 });

    // 4. Select compendiums in the UI
    const selections = [
      {
        section: "Template Compendiums",
        packId: "world.test-learning-feats",
        note: "Items dropped from these compendiums can start projects.",
      },
      {
        section: "Instructor Compendiums",
        packId: "world.test-teachers",
        note: "Compendiums containing actors with Teacher Offerings.",
      },
      {
        section: "Book Compendiums",
        packId: "world.test-learning-books",
        note: "Compendiums containing items with Learning Book bonuses.",
      },
    ];

    for (const { section, packId, note } of selections) {
      // Find the specific section by its unique note text
      const sectionGroup = settingsDialog.locator("section").filter({
        has: page.locator("p.notes", { hasText: note }),
      });

      // Find the checkbox within that specific section
      const cb = sectionGroup.locator(`input[data-pack-id="${packId}"]`);

      // Wait for it to be visible (handles async loading)
      await expect(cb).toBeVisible({ timeout: 20000 });

      const isChecked = await cb.isChecked();
      if (!isChecked) {
        await cb.check();
      }
    }

    // 5. Change a rule in the UI (Log Level / Notification Level)
    const notificationSelect = page.locator("select#rule-notification-level");
    await expect(notificationSelect).toBeVisible({ timeout: 10000 });
    await notificationSelect.selectOption("debug");
    await expect(notificationSelect).toHaveValue("debug");

    // Give Svelte a moment to sync state (especially important with Svelte 5 $effect)
    await page.waitForTimeout(1000);

    // 6. Click Save
    await page.getByRole("button", { name: "Save Settings" }).click();

    // Wait for settings to persist
    await page.waitForFunction(
      () => {
        const moduleId = "thefehrs-learning-manager";
        const rules = (game as any).settings.get(moduleId, "rules");
        return rules?.notificationLevel === "debug";
      },
      { timeout: 10000 },
    );

    // 7. Verify settings are saved via API
    const savedSettings = await page.evaluate(() => {
      const moduleId = "thefehrs-learning-manager";
      return {
        allowed: (game as any).settings.get(moduleId, "allowedCompendiums"),
        teachers: (game as any).settings.get(moduleId, "teacherCompendiums"),
        books: (game as any).settings.get(moduleId, "bookCompendiums"),
        rules: (game as any).settings.get(moduleId, "rules"),
      };
    });

    expect(savedSettings.allowed).toContain("world.test-learning-feats");
    expect(savedSettings.teachers).toContain("world.test-teachers");
    expect(savedSettings.books).toContain("world.test-learning-books");
    expect(savedSettings.rules.notificationLevel).toBe("debug");

    console.log("Settings UI test completed successfully");
  });
});
