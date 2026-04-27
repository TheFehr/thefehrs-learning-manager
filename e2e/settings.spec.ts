import { test, expect } from "@playwright/test";

test.describe("Settings UI", () => {
  test("configure compendiums via UI and verify save", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/game");

    // Wait for game to be ready
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    // 1. Ensure settings are registered (fallback logic from original test)
    await page.evaluate(() => {
      const moduleId = "thefehrs-learning-manager";
      const missing = [
        "allowedCompendiums",
        "teacherCompendiums",
        "bookCompendiums",
        "rules",
        "timeUnits",
      ];
      for (const key of missing) {
        if (!(game as any).settings.settings.has(`${moduleId}.${key}`)) {
          console.log(`Manually registering ${key} for test stability`);
          (game as any).settings.register(moduleId, key, {
            scope: "world",
            config: false,
            type: key === "rules" || key === "timeUnits" ? Object : Array,
            default: key === "rules" ? {} : key === "timeUnits" ? [] : [],
          });
        }
      }
    });

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
      { section: "Template Compendiums", packId: "world.test-learning-feats" },
      { section: "Instructor Compendiums", packId: "world.test-teachers" },
      { section: "Book Compendiums", packId: "world.test-learning-books" },
    ];

    for (const { section, packId } of selections) {
      const sectionLocator = page
        .locator(".world-settings section, .world-settings")
        .filter({ has: page.getByRole("heading", { name: section }) });
      // If the above doesn't work well, we can try finding the heading and then the next CompendiumConfig
      // But let's try a simpler approach: find the checkbox that is descendant of a container with the heading
      const checkbox = page
        .locator("h3")
        .filter({ hasText: section })
        .locator("xpath=following-sibling::div[1]//input[@data-pack-id='" + packId + "']")
        .first();

      // Actually, a cleaner way with Playwright:
      const group = page
        .locator("div.world-settings > h3")
        .filter({ hasText: section })
        .locator("xpath=following-sibling::section[1]");
      const cb = group.locator(`input[data-pack-id="${packId}"]`);

      await expect(cb).toBeVisible({ timeout: 10000 });

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
