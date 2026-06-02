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
});

test.describe("Advanced Time Bank Management", () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test("Spend All functionality for PC 3", async ({ page }) => {
    const moduleId = "thefehrs-learning-manager";

    // 1. Setup PC 3 with 100 hours and reset progress
    await page.evaluate(async (moduleId) => {
      let actor = (game as any).actors.getName("PC 3");
      if (!actor) {
        actor = await Actor.create({
          name: "PC 3",
          type: "character",
          img: "icons/svg/mystery-man.svg",
          flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
        });
      }

      // Clean up any existing initiated or template projects on PC 3
      const existingProjects = actor.items.filter((i: any) => i.name.includes("Time Bank Project"));
      for (const p of existingProjects) {
        await p.delete();
      }

      // Create a temporary world Item
      const item = await Item.create({
        name: "Time Bank Project",
        type: "feat",
        system: {
          description: { value: "A feat for testing time bank spend-all functionality." },
          type: { value: "feat" },
          activities: {},
        },
        flags: {
          [moduleId]: {
            isLearningProject: true,
            projectData: { target: 100, progress: 0 },
          },
        },
      });

      // Initiate project from the world item
      const api = (game as any).modules.get(moduleId).api;
      const project = await api.ProjectEngine.initiateProjectFromItem(actor, item);
      if (!project) throw new Error("Failed to initiate Time Bank Project on actor");

      // Clean up temporary world item since it is now embedded and initiated
      await item.delete();

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

      // Sync activities
      await api.ProjectEngine.syncAllProjectActivities();

      // Open actor sheet to interact with it
      actor.sheet.render(true);
    }, moduleId);

    try {
      // 2. Wait for actor sheet
      const sheet = page.locator(".window-app, .sheet.actor, foundry-app").first();
      await expect(sheet).toBeVisible({
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
      const dialog = page
        .locator(".thefehrs-learning-manager-dialog, .instructor-selection, .dialog")
        .first();
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
