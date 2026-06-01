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

    // 3. Test "Add Pinned Compendium"
    const addCompendiumBtn = treeViewApp.getByRole("button", { name: "Add Compendium" });
    await forceClick(addCompendiumBtn);
    await forceClick(page.locator(".result-item").filter({ hasText: "Test Learning Feats" }));

    // Verify compendium node exists
    const packNode = treeViewApp
      .locator(".tree-node-content")
      .filter({ hasText: "Test Learning Feats" });
    await expect(packNode).toBeVisible();

    // 4. Test "Add Project" (Pinned Root)
    await forceClick(treeViewApp.getByRole("button", { name: "Add Project" }));
    await forceClick(page.locator(".result-item").filter({ hasText: "Apprentice Project" }));

    const rootNode = treeViewApp
      .locator(".tree-node-content")
      .filter({ hasText: "Apprentice Project" });
    await expect(rootNode).toBeVisible();

    // 5. Test Hierarchical Assignment
    const childItem = await page.evaluate(async (pid) => {
      const pack = (game as any).packs.get(pid);
      const entry = pack.index.getName("Journeyman Project");
      return await pack.getDocument(entry._id);
    }, packId);

    const rootId = await rootNode.getAttribute("data-node-id");
    await page.evaluate(
      async ({ item, rid }) => {
        const dropData = { type: "Item", uuid: item.uuid };
        const event = new CustomEvent("drop", { bubbles: true });
        // @ts-ignore
        event.dataTransfer = { getData: () => JSON.stringify(dropData) };
        const target = document.querySelector(`[data-node-id="${rid}"]`);
        target?.dispatchEvent(event);
      },
      { item: childItem, rid: rootId },
    );

    const childNode = treeViewApp
      .locator(".tree-node-content")
      .filter({ hasText: "Journeyman Project" });
    await expect(childNode).toBeVisible({ timeout: 10000 });

    // 6. Test Removal
    const removeBtn = childNode.locator(".remove-node");
    await forceClick(removeBtn);
    await expect(childNode).not.toBeVisible();

    // 7. Test Edit
    const editBtn = rootNode.locator(".edit-node");
    await forceClick(editBtn);

    const itemSheet = page
      .locator(".window-app, .sheet.item")
      .filter({ hasText: "Apprentice Project" })
      .first();
    await expect(itemSheet).toBeVisible();
    await itemSheet.close();

    // 8. Test Search
    const searchInput = treeViewApp.locator('input[placeholder*="Search"]');
    await searchInput.fill("Journeyman");
    await expect(rootNode).not.toBeVisible();

    await searchInput.fill("Apprentice");
    await expect(rootNode).toBeVisible();

    // 9. Test Filter
    await searchInput.fill("");
    const filterBtn = treeViewApp.locator(".filter-button");
    await forceClick(filterBtn);
    await forceClick(page.locator(".filter-option").filter({ hasText: "Test Learning Feats" }));
    await expect(rootNode).toBeVisible();

    // 10. Test Collapsing
    const expandBtn = rootNode.locator(".expand-button");
    await forceClick(expandBtn);
  });
});
