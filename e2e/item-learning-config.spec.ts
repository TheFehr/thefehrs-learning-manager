import { test, expect } from "./fixtures";

test.describe("Item Learning Configuration", () => {
  test("verify mutually exclusive Project/Book configuration in world items", async ({ page }) => {
    test.setTimeout(180000);
    page.on("console", (msg) => console.log("BROWSER CONSOLE:", msg.text()));
    await page.goto("/game");

    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

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

      // Find Tidy5e sheet class
      const classes = (CONFIG as any).Item.sheetClasses[item.type];
      const tidyKey = Object.keys(classes).find((k) => k.toLowerCase().includes("tidy"));

      if (tidyKey) {
        console.log(`Setting sheet class to ${tidyKey}`);
        await item.setFlag("core", "sheetClass", tidyKey);
      }

      // Set flags to enable the tab but don't make it a "project" yet
      await item.update({
        [`flags.${moduleId}`]: {
          learningModeEnabled: true,
          learningBookBonus: { modifier: 0 },
        },
      });

      console.log(`Created item ${item.name} with ID ${item.id}. Tab should be enabled.`);

      // @ts-ignore
      item.sheet.render(true);
    }, moduleId);

    // 2. Wait for item sheet and switch to Learning tab
    const itemSheet = page
      .locator(".window-app, .tidy5e-sheet, .application")
      .filter({ hasText: "World Configuration Test Item" })
      .first();
    await expect(itemSheet).toBeVisible({ timeout: 20000 });

    // Try to find the tab by various means
    const learningTab = itemSheet
      .locator(
        '[data-tab*="learning-manager"], [data-tab*="item-target-config"], .item:has-text("Learning"), a:has-text("Learning")',
      )
      .first();

    if ((await learningTab.count()) === 0) {
      const html = await itemSheet.innerHTML();
      console.log("SHEET HTML SNIPPET:", html.substring(0, 1000));
    }

    // Wait for the tab to exist and be visible
    await expect(learningTab).toBeVisible({ timeout: 15000 });
    await learningTab.click();

    // Verify tab content is loaded by looking for our specific component root
    await expect(itemSheet.locator(".thefehrs-item-learning-config")).toBeVisible({
      timeout: 10000,
    });

    // 3. Verify both Project and Book configs are visible initially
    // (since modifier is 0 and no project data yet)
    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeVisible({
      timeout: 10000,
    });
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeVisible();

    // 4. Configure as a BOOK (fill modifier)
    await itemSheet.locator("#book-modifier").fill("5");

    // 5. Verify Project Configuration is now HIDDEN (auto-waits)
    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeHidden();
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeVisible();

    // 6. Clear Book modifier (set to 0)
    await itemSheet.locator("#book-modifier").fill("0");

    // 7. Verify BOTH are visible again (auto-waits)
    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeVisible();
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeVisible();

    // 8. Configure as a PROJECT (fill target)
    await itemSheet.locator("#target-progress").fill("10");

    // 9. Verify Book Configuration is now HIDDEN (auto-waits)
    await expect(itemSheet.locator("h4:has-text('Learning Book Configuration')")).toBeHidden();
    await expect(itemSheet.locator("h4:has-text('Project Configuration')")).toBeVisible();
  });
});
