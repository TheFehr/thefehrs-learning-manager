import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-item-config",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

    await page.evaluate(async (moduleId) => {
      const name = "World Configuration Test Item";
      const existing = (game as any).items.getName(name);
      if (existing) await existing.delete();

      const item = await Item.create({
        name,
        type: "loot",
        img: "icons/sundries/books/book-plain-brown.webp",
      });

      await item.update({
        [`flags.${moduleId}`]: {
          learningModeEnabled: true,
          learningBookBonus: { modifier: 0 },
        },
        "flags.core.sheetClass": "dnd5e.Tidy5eItemSheetQuadrone",
      });
    }, moduleId);
  },
});

test.describe("Item Learning Configuration", () => {
  test("verify mutually exclusive Project/Book configuration in world items", async ({ page }) => {
    await page.evaluate(async (moduleId) => {
      const item = (game as any).items.getName("World Configuration Test Item");
      // @ts-ignore
      item.sheet.render(true);
    }, moduleId);

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
    await expect(learningTab).toBeVisible({ timeout: 15000 });
    await learningTab.click();

    await expect(itemSheet.locator(".thefehrs-item-learning-config")).toBeVisible({
      timeout: 10000,
    });

    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeVisible({
      timeout: 10000,
    });
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeVisible();

    // Configure as Book
    await itemSheet.locator("#book-modifier").fill("5");
    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeHidden();
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeVisible();

    // Clear book modifier
    await itemSheet.locator("#book-modifier").fill("0");
    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeVisible();
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeVisible();

    // Configure as Project
    await itemSheet.locator("#target-progress").fill("10");
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeHidden();
    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeVisible();
  });
});
