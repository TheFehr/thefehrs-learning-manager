import { test, expect, useFoundry, waitForReady, loginAs } from "@thefehr/foundry-playwright";
import { clearFoundryOverlays, setupTourKiller, forceClick } from "./utils";

useFoundry(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  deleteIfExists: true,
});

test.describe("Project Tree View E2E", () => {
  test("full hierarchical management flow", async ({ page }) => {
    await setupTourKiller(page.context());
    await page.goto("/game");
    await loginAs(page, "Gamemaster");
    await waitForReady(page);
    await clearFoundryOverlays(page);
    await page.waitForTimeout(2000);

    const moduleId = "thefehrs-learning-manager";
    const packId = "world.test-learning-feats";

    // 1. Initial State Setup
    await page.evaluate(
      async ({ mid, pid }) => {
        let pack = (game as any).packs.get(pid);
        if (!pack) {
          // @ts-ignore
          pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
            type: "Item",
            label: "Test Learning Feats",
            name: "test-learning-feats",
            package: "world",
          });
        }
        await Item.create(
          [
            {
              name: "Apprentice Project",
              type: "feat",
              img: "icons/skills/trades/smithing-anvil-silver.webp",
              system: { type: { value: "feat" }, activities: {}, description: { value: "Root" } },
              flags: { [mid]: { isLearningProject: true, projectData: { target: 100 } } },
            },
            {
              name: "Journeyman Project",
              type: "feat",
              img: "icons/skills/trades/smithing-anvil-silver.webp",
              system: { type: { value: "feat" }, activities: {}, description: { value: "Child" } },
              flags: { [mid]: { isLearningProject: true, projectData: { target: 200 } } },
            },
          ],
          { pack: pid },
        );
        await (game as any).settings.set(mid, "allowedCompendiums", [pid]);
      },
      { mid: moduleId, pid: packId },
    );

    // 2. Open Tree View directly via API
    const appId = await page.evaluate(async (mid) => {
      // @ts-ignore
      const menu = game.settings.menus.get(`${mid}.treeViewMenu`);
      if (menu) {
        const app = new menu.type();
        await app.render(true);
        return app.id || app.options.id;
      } else {
        throw new Error(`Tree View menu for ${mid} not found`);
      }
    }, moduleId);

    const treeViewApp = page
      .locator(`[id="${appId}"], .window-app:has-text("Learning Project Tree View")`)
      .first();
    await expect(treeViewApp).toBeVisible({ timeout: 20000 });

    // 3. Verify both projects appear from allowed compendiums
    const apprenticeNode = treeViewApp
      .locator(".tree-node-content")
      .filter({ hasText: "Apprentice Project" });
    const journeymanNode = treeViewApp
      .locator(".tree-node-content")
      .filter({ hasText: "Journeyman Project" });

    await expect(apprenticeNode).toBeVisible({ timeout: 10000 });
    await expect(journeymanNode).toBeVisible({ timeout: 10000 });

    // 4. Test Hierarchical Assignment — set follow-up link directly then refresh
    await page.evaluate(
      async ({ mid, pid }) => {
        const pack = (game as any).packs.get(pid);
        const apprenticeEntry = pack.index.getName("Apprentice Project");
        const journeymanEntry = pack.index.getName("Journeyman Project");
        const apprenticeDoc = await pack.getDocument(apprenticeEntry._id);
        const journeymanDoc = await pack.getDocument(journeymanEntry._id);
        await apprenticeDoc.update({
          [`flags.${mid}.projectData.followUpProjectId`]: journeymanDoc.uuid,
        });
      },
      { mid: moduleId, pid: packId },
    );

    await forceClick(treeViewApp.getByRole("button", { name: "Refresh project tree" }));

    // Both nodes still visible; Journeyman is now a child of Apprentice
    await expect(apprenticeNode).toBeVisible({ timeout: 10000 });
    await expect(journeymanNode).toBeVisible({ timeout: 10000 });

    // 5. Apprentice should now have an expand button (it has children)
    const expandBtn = apprenticeNode.locator(".expand-button");
    await expect(expandBtn).toBeVisible({ timeout: 10000 });

    // 6. Collapse Apprentice — Journeyman should disappear
    await forceClick(expandBtn);
    await expect(journeymanNode).not.toBeVisible({ timeout: 5000 });

    // 7. Expand Apprentice — Journeyman visible again
    await forceClick(expandBtn);
    await expect(journeymanNode).toBeVisible({ timeout: 5000 });

    // 8. Break the link — Journeyman back to root
    const breakLinkBtn = journeymanNode.locator(".icon-btn.danger");
    await forceClick(breakLinkBtn);

    const confirmBtn = page.getByRole("button", { name: /Yes/i }).first();
    await forceClick(confirmBtn);

    await expect(journeymanNode).toBeVisible({ timeout: 10000 });

    // 9. Test Search
    const searchInput = treeViewApp.locator('input[aria-label="Search projects"]');
    await searchInput.fill("Journeyman");
    await expect(apprenticeNode).not.toBeVisible({ timeout: 5000 });

    await searchInput.fill("Apprentice");
    await expect(apprenticeNode).toBeVisible({ timeout: 5000 });

    await searchInput.fill("");
    await expect(apprenticeNode).toBeVisible({ timeout: 5000 });
    await expect(journeymanNode).toBeVisible({ timeout: 5000 });

    // 10. Expand/Collapse All
    await forceClick(treeViewApp.getByRole("button", { name: "Expand all projects" }));
    await forceClick(treeViewApp.getByRole("button", { name: "Collapse all projects" }));
  });
});
