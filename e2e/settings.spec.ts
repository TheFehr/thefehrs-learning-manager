import { test, expect, useFoundry, waitForReady, loginAs } from "@thefehr/foundry-playwright";
import { clearFoundryOverlays, setupTourKiller, forceClick } from "./utils";

useFoundry(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: "thefehrs-learning-manager",
  adminPassword: "admin",
  deleteIfExists: true,
});

test.describe("Settings UI", () => {
  test("configure compendiums via UI and verify save", async ({ page }) => {
    await setupTourKiller(page.context());
    await page.goto("/game");
    await loginAs(page, "Gamemaster");
    await waitForReady(page);
    await clearFoundryOverlays(page);
    await page.waitForTimeout(2000);

    const moduleId = "thefehrs-learning-manager";

    // 0. Setup: Create Compendiums
    await page.evaluate(async () => {
      const packs = [
        { name: "test-learning-feats", label: "Test Learning Feats", type: "Item" },
        { name: "test-teachers", label: "Test Teachers", type: "Actor" },
        { name: "test-learning-books", label: "Test Learning Books", type: "Item" },
      ];

      for (const p of packs) {
        const packId = `world.${p.name}`;
        let pack = (game as any).packs.get(packId);
        if (pack) await pack.deleteCompendium();

        // @ts-ignore
        await foundry.documents.collections.CompendiumCollection.createCompendium({
          type: p.type,
          label: p.label,
          name: p.name,
          package: "world",
        });
      }
    });

    // 1. Ensure settings are registered
    await page.evaluate(() => {
      const moduleId = "thefehrs-learning-manager";
      (game as any).settings.set(moduleId, "allowedCompendiums", []);
    });

    // 2. Open Module Settings directly via API and get its ID
    const appId = await page.evaluate(async (mid) => {
      // @ts-ignore
      const menu = game.settings.menus.get(`${mid}.configMenu`);
      if (menu) {
        const app = new menu.type();
        await app.render(true);
        return app.id || app.options.id;
      } else {
        throw new Error(`Settings menu for ${mid} (configMenu) not found`);
      }
    }, moduleId);

    // 3. Interact with the Settings App (Svelte)
    const customSettingsApp = page
      .locator(`[id="${appId}"], .window-app:has-text("Downtime Engine Configuration")`)
      .first();
    await expect(customSettingsApp).toBeVisible({ timeout: 20000 });

    // Verify compendiums are listed and toggle them
    const selections = [
      {
        packId: "world.test-learning-feats",
        note: "Items dropped from these compendiums can start projects.",
      },
      {
        packId: "world.test-teachers",
        note: "Compendiums containing actors with Teacher Offerings.",
      },
      {
        packId: "world.test-learning-books",
        note: "Compendiums containing items with Learning Book bonuses.",
      },
    ];

    for (const { packId, note } of selections) {
      const sectionGroup = customSettingsApp.locator("section").filter({ hasText: note }).first();
      const cb = sectionGroup.locator(`input[data-pack-id="${packId}"]`).first();
      await expect(cb).toBeVisible({ timeout: 30000 });

      const isChecked = await cb.isChecked();
      if (!isChecked) {
        await forceClick(cb);
      }
    }

    // Toggle a rule - use evaluate to set select to bypass option visibility issues
    await customSettingsApp
      .locator("select")
      .first()
      .evaluate((el: HTMLSelectElement) => {
        el.value = "debug";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });

    // Save
    await forceClick(customSettingsApp.getByRole("button", { name: /Save Changes/i }));

    // 4. Verify settings were saved in Foundry
    await expect(async () => {
      const savedSettings = await page.evaluate(() => {
        const moduleId = "thefehrs-learning-manager";
        const settings = (game as any).settings;
        return {
          allowed: settings.get(moduleId, "allowedCompendiums"),
          teachers: settings.get(moduleId, "teacherCompendiums"),
          books: settings.get(moduleId, "bookCompendiums"),
          rules: settings.get(moduleId, "rules"),
        };
      });

      expect(savedSettings.allowed).toContain("world.test-learning-feats");
      expect(savedSettings.teachers).toContain("world.test-teachers");
      expect(savedSettings.books).toContain("world.test-learning-books");
      expect(savedSettings.rules.notificationLevel).toBe("debug");
    }).toPass({ timeout: 15000 });
  });
});
