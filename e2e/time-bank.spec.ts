import { test, expect } from "./fixtures";

test.describe("Advanced Time Bank Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/game");
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });
  });

  test("Spend All functionality for PC 3", async ({ page }) => {
    test.setTimeout(120000);
    const moduleId = "thefehrs-learning-manager";

    // 1. Setup PC 3 with 100 hours and reset progress
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
      if (!project) throw new Error("Time Bank Project not found");

      // Capture original state
      (window as any).__originalStateSpendAll = {
        rules: JSON.parse(JSON.stringify((game as any).settings.get(moduleId, "rules"))),
        bank: JSON.parse(JSON.stringify(actor.getFlag(moduleId, "bank") || {})),
        projectData: JSON.parse(JSON.stringify(project.getFlag(moduleId, "projectData") || {})),
      };

      // Set DC to 1 and method to direct to ensure progress is guaranteed for the test
      const rules = (game as any).settings.get(moduleId, "rules");
      await (game as any).settings.set(moduleId, "rules", {
        ...rules,
        checkDC: 1,
        bulkMethod: "direct",
        nonBulkMethod: "direct",
      });

      await actor.setFlag(moduleId, "bank", { total: 100 });
      const projectData = project.getFlag(moduleId, "projectData") || {};
      await project.setFlag(moduleId, "projectData", { ...projectData, progress: 0 });

      // Open actor sheet to interact with it
      actor.sheet.render(true);
    }, moduleId);

    try {
      // 2. Wait for actor sheet
      await expect(page.locator(".tidy5e-sheet, .dnd5e.sheet.actor")).toBeVisible({
        timeout: 20000,
      });

      // 3. Trigger "Spend all time" activity
      await page.evaluate(async (moduleId) => {
        const actor = (game as any).actors.getName("PC 3");
        const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
        const activities = project.system.activities.contents;
        const spendAllActivity = activities.find((a: any) =>
          a.name.toLowerCase().includes("spend all time"),
        );
        if (!spendAllActivity) throw new Error("Spend all time activity not found");
        spendAllActivity.use();
      }, moduleId);

      // 4. Verify confirmation dialog appears
      const dialog = page.locator(".thefehrs-learning-manager-dialog, dialog").last();
      await expect(dialog).toBeVisible({ timeout: 15000 });
      await expect(
        dialog.getByText(/Are you sure you want to spend.*all.*available training time/i),
      ).toBeVisible();

      // 5. Confirm
      await dialog.getByRole("button", { name: /Yes/i }).click();

      // 6. Verify bank is empty and project progressed
      await page.waitForFunction(
        (moduleId) => {
          const actor = (game as any).actors.getName("PC 3");
          const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
          const bankTotal = actor.getFlag(moduleId, "bank")?.total;
          const progress = project.getFlag(moduleId, "projectData")?.progress;
          return bankTotal === 0 && progress > 0;
        },
        moduleId,
        { timeout: 15000 },
      );

      const stats = await page.evaluate((moduleId) => {
        const actor = (game as any).actors.getName("PC 3");
        const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
        return {
          bankTotal: actor.getFlag(moduleId, "bank")?.total,
          progress: project.getFlag(moduleId, "projectData")?.progress,
        };
      }, moduleId);

      expect(stats.bankTotal).toBe(0);
      expect(stats.progress).toBeGreaterThan(0);
    } finally {
      // Restore state
      await page.evaluate(async (moduleId) => {
        const state = (window as any).__originalStateSpendAll;
        if (!state) return;

        const actor = (game as any).actors.getName("PC 3");
        await (game as any).settings.set(moduleId, "rules", state.rules);

        if (actor) {
          await actor.setFlag(moduleId, "bank", state.bank);
          const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
          if (project) {
            await project.setFlag(moduleId, "projectData", state.projectData);
            actor.sheet.close();
          }
        }
        delete (window as any).__originalStateSpendAll;
      }, moduleId);
    }
  });
});
