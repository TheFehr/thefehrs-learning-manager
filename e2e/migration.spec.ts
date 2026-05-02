import { test, expect } from "./fixtures";

test.describe("v4.2.0 Data Migration E2E", () => {
  test("should migrate legacy follow-up links to new array format", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/game");

    // Wait for game to be ready
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    const moduleId = "thefehrs-learning-manager";
    const packId = "world.test-learning-feats";

    // 1. Setup Legacy Data in Compendium
    await page.evaluate(
      async ({ mid, pid }) => {
        const pack = (game as any).packs.get(pid);
        const docs = await pack.getDocuments();

        const root = docs.find((i: any) => i.name === "Apprentice Project");
        const child = docs.find((i: any) => i.name === "Journeyman Project");

        if (root && child) {
          // Force legacy singular format and clear modern array
          await root.update({
            [`flags.${mid}.projectData.followUpProjectId`]: child.uuid,
            [`flags.${mid}.projectData.followUpProjectIds`]: null,
            [`flags.${mid}.isLearningProject`]: true,
          });
        }
      },
      { mid: moduleId, pid: packId },
    );

    // 2. Trigger Migration manually by downgrading version and reloading
    await page.evaluate(
      async ({ mid }) => {
        await (game as any).settings.set(mid, "migrationVersion", "4.1.1");
        location.reload();
      },
      { mid: moduleId },
    );

    // 3. Wait for reload and readiness, and confirm migration version updated
    await page.waitForFunction(
      (mid) => {
        return (
          typeof (game as any) !== "undefined" &&
          (game as any).ready &&
          (game as any).settings.get(mid, "migrationVersion") === "4.2.0"
        );
      },
      moduleId,
      { timeout: 60000 },
    );

    // 4. Verify Migration Results behaviorally
    const migrationSuccess = await page.evaluate(
      async ({ mid, pid }) => {
        const pack = (game as any).packs.get(pid);
        const docs = await pack.getDocuments();
        const root = docs.find((i: any) => i.name === "Apprentice Project");
        const child = docs.find((i: any) => i.name === "Journeyman Project");

        const data = root.getFlag(mid, "projectData");

        return {
          legacyCleared: !data?.followUpProjectId,
          modernSet:
            Array.isArray(data?.followUpProjectIds) && data.followUpProjectIds.includes(child.uuid),
          version: (game as any).settings.get(mid, "migrationVersion"),
        };
      },
      { mid: moduleId, pid: packId },
    );

    expect(migrationSuccess.version).toBe("4.2.0");
    expect(migrationSuccess.legacyCleared).toBe(true);
    expect(migrationSuccess.modernSet).toBe(true);

    // 5. Verify Visibility in Tree View
    await page.evaluate(async (mid) => {
      const menu = (game as any).settings.menus.get(`${mid}.treeViewMenu`);
      const app = new menu.type();
      await app.render(true);
    }, moduleId);

    const rootNode = page.locator(".tree-node-content").filter({ hasText: "Apprentice Project" });
    const childNode = page.locator(".tree-node-content").filter({ hasText: "Journeyman Project" });

    await expect(rootNode).toBeVisible({ timeout: 15000 });
    await expect(childNode).toBeVisible({ timeout: 15000 });
    await expect(childNode.locator(".guide-line")).toHaveCount(1);
  });
});
