import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { forceClick, waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";
const packId = "world.test-learning-feats";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-tree-view",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

    await page.evaluate(
      async ({ mid, pid }) => {
        let pack = (game as any).packs.get(pid);
        if (!pack) {
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
  },
});

test.describe("Project Tree View E2E", () => {
  test("full hierarchical management flow", async ({ page }) => {
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

    const apprenticeNode = treeViewApp
      .locator(".tree-node-content")
      .filter({ hasText: "Apprentice Project" });
    const journeymanNode = treeViewApp
      .locator(".tree-node-content")
      .filter({ hasText: "Journeyman Project" });

    await expect(apprenticeNode).toBeVisible({ timeout: 10000 });
    await expect(journeymanNode).toBeVisible({ timeout: 10000 });

    // Set follow-up link directly then refresh
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

    await expect(apprenticeNode).toBeVisible({ timeout: 10000 });
    await expect(journeymanNode).toBeVisible({ timeout: 10000 });

    const expandBtn = apprenticeNode.locator(".expand-button");
    await expect(expandBtn).toBeVisible({ timeout: 10000 });

    await forceClick(expandBtn);
    await expect(journeymanNode).not.toBeVisible({ timeout: 5000 });

    await forceClick(expandBtn);
    await expect(journeymanNode).toBeVisible({ timeout: 5000 });

    const breakLinkBtn = journeymanNode.locator(".icon-btn.danger");
    await forceClick(breakLinkBtn);

    const confirmBtn = page.getByRole("button", { name: /Yes/i }).first();
    await forceClick(confirmBtn);

    await expect(journeymanNode).toBeVisible({ timeout: 10000 });

    const searchInput = treeViewApp.locator('input[aria-label="Search projects"]');
    await searchInput.fill("Journeyman");
    await expect(apprenticeNode).not.toBeVisible({ timeout: 5000 });

    await searchInput.fill("Apprentice");
    await expect(apprenticeNode).toBeVisible({ timeout: 5000 });

    await searchInput.fill("");
    await expect(apprenticeNode).toBeVisible({ timeout: 5000 });
    await expect(journeymanNode).toBeVisible({ timeout: 5000 });

    await forceClick(treeViewApp.getByRole("button", { name: "Expand all projects" }));
    await forceClick(treeViewApp.getByRole("button", { name: "Collapse all projects" }));
  });
});
