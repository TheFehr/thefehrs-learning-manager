import { test, expect } from "./fixtures";

test.describe("Project Tree View E2E", () => {
  test("full hierarchical management flow", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/game");

    // Wait for game to be ready
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    const moduleId = "thefehrs-learning-manager";
    const packId = "world.test-learning-feats";

    // 1. Initial State Setup: Ensure no links and NO project flags
    await page.evaluate(
      async ({ mid, pid }) => {
        const pack = (game as any).packs.get(pid);
        const items = await pack.getDocuments();
        for (const item of items) {
          await item.update({
            [`flags.${mid}.-=projectData`]: null,
            [`flags.${mid}.isLearningProject`]: false,
          });
        }

        const allowed = (game as any).settings.get(mid, "allowedCompendiums") || [];
        if (!allowed.includes(pid)) {
          await (game as any).settings.set(mid, "allowedCompendiums", [...allowed, pid]);
        }
      },
      { mid: moduleId, pid: packId },
    );

    // 2. Open Tree View
    await page.evaluate(async (mid) => {
      const menu = (game as any).settings.menus.get(`${mid}.treeViewMenu`);
      const app = new menu.type();
      await app.render(true);
    }, moduleId);

    // 3. Verify Empty State (Since no projects exist)
    await expect(
      page.locator(".window-title").filter({ hasText: "Learning Project Tree View" }),
    ).toBeVisible();
    await expect(page.locator(".state-message.empty")).toBeVisible();

    // 4. Test "Add Project" (Pinned Root)
    await page.getByRole("button", { name: "Add Project" }).click();
    await page.locator(".result-item").filter({ hasText: "Apprentice Project" }).click();

    // Verify it appeared as root
    const rootNode = page.locator(".tree-node-content").filter({ hasText: "Apprentice Project" });
    await expect(rootNode).toBeVisible();

    // 5. Test "Add Follow-up" (+) button
    await rootNode.locator("button[title='Add Follow-up']").click();
    await page.locator(".result-item").filter({ hasText: "Journeyman Project" }).click();

    // Wait for picker to close
    await expect(
      page.locator(".window-title").filter({ hasText: "Add Follow-up Project" }),
    ).toBeHidden();

    // Verify Journeyman is now a child
    const childNode = page.locator(".tree-node-content").filter({ hasText: "Journeyman Project" });
    await expect(childNode).toBeVisible({ timeout: 10000 });
    await expect(childNode.locator(".guide-line")).toHaveCount(1);

    // 6. Test Break Link
    await childNode.locator("button[title='Break Link']").click();
    await page.getByRole("button", { name: "Yes" }).click();

    // Journeyman should DISAPPEAR because it has no project flag and no parent now
    await expect(childNode).not.toBeVisible();

    // 7. Test "Show All Items" to find it again
    await page.locator("input[type='checkbox']").check();
    await expect(childNode).toBeVisible();
    await expect(childNode.locator(".guide-line")).toHaveCount(0); // It's a root in "Show All"

    // 8. Test Drag and Drop Reparenting
    const dragHandle = childNode.locator(".node-drag-handle");
    await dragHandle.waitFor();
    await rootNode.waitFor();

    // Drag and drop can be flaky, so we retry if the post-condition isn't met
    await expect(async () => {
      await dragHandle.dragTo(rootNode);
      await expect(childNode.locator(".guide-line")).toHaveCount(1);
    }).toPass({
      intervals: [1000, 2000, 5000],
      timeout: 15000,
    });

    // 9. Test Search
    const searchInput = page.getByPlaceholder("Search projects...");
    await searchInput.fill("Journey");
    await expect(rootNode).toBeVisible(); // Context
    await expect(childNode).toBeVisible();
    await searchInput.fill("");

    // 10. Test Collapsing
    const expandBtn = rootNode.locator(".expand-button");
    await expandBtn.click();
    await expect(childNode).not.toBeVisible();
  });
});
