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

test.describe("Item Learning Configuration", () => {
  test("verify mutually exclusive Project/Book configuration in world items", async ({ page }) => {
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

    // 1. Create a World Item and ensure it's configured to show the Learning tab
    await page.evaluate(async (moduleId) => {
      const name = "World Configuration Test Item";
      const existing = (game as any).items.getName(name);
      if (existing) await existing.delete();

      // Create as loot
      const item = await Item.create({
        name,
        type: "loot",
        img: "icons/sundries/books/book-plain-brown.webp",
      });

      // Set flags to enable the tab but don't make it a "project" yet
      await item.update({
        [`flags.${moduleId}`]: {
          learningModeEnabled: true,
          learningBookBonus: { modifier: 0 },
        },
        "flags.core.sheetClass": "dnd5e.Tidy5eItemSheetQuadrone",
      });

      // @ts-ignore
      item.sheet.render(true);
    }, moduleId);

    // 2. Wait for item sheet and switch to Learning tab
    const itemSheet = page
      .locator(".window-app, .sheet.actor, .sheet.item, .tidy5e-sheet, foundry-app, .application")
      .filter({ hasText: "World Configuration Test Item" })
      .first();
    await expect(itemSheet).toBeVisible({ timeout: 20000 });

    const learningTab = itemSheet
      .locator(
        '[data-tab*="learning-manager"], [data-tab*="item-target-config"], .item:has-text("Learning"), a:has-text("Learning")',
      )
      .first();

    // Wait for the tab to exist and be visible
    await expect(learningTab).toBeVisible({ timeout: 15000 });
    await learningTab.click();

    // Verify tab content is loaded by looking for our specific component root
    await expect(itemSheet.locator(".thefehrs-item-learning-config")).toBeVisible({
      timeout: 10000,
    });

    // 3. Verify both Project and Book configs are visible initially
    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeVisible({
      timeout: 10000,
    });
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeVisible();

    // 4. Configure as a BOOK (fill modifier)
    await itemSheet.locator("#book-modifier").fill("5");

    // 5. Verify Project Configuration is now HIDDEN
    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeHidden();
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeVisible();

    // 6. Clear Book modifier (set to 0)
    await itemSheet.locator("#book-modifier").fill("0");

    // 7. Verify BOTH are visible again
    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeVisible();
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeVisible();

    // 8. Configure as a PROJECT (fill target)
    await itemSheet.locator("#target-progress").fill("10");

    // 9. Verify Book Configuration is now HIDDEN
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeHidden();
    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeVisible();
  });
});
