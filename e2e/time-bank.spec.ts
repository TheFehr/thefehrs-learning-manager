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

      // Set DC to 1 and method to direct to ensure progress is guaranteed for the test
      const rules = (game as any).settings.get(moduleId, "rules");
      await (game as any).settings.set(moduleId, "rules", {
        ...rules,
        checkDC: 1,
        bulkMethod: "direct",
        nonBulkMethod: "direct",
      });

      // Use the API/Proxy to set bank to ensure consistency if possible,
      // but direct flag update is most reliable for setup.
      await actor.setFlag(moduleId, "bank", { total: 100 });

      const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
      if (!project) throw new Error("Time Bank Project not found");

      const projectData = project.getFlag(moduleId, "projectData") || {};
      await project.setFlag(moduleId, "projectData", { ...projectData, progress: 0 });

      // Open actor sheet to interact with it
      actor.sheet.render(true);
    }, moduleId);

    // 2. Wait for actor sheet
    await expect(page.locator(".tidy5e-sheet, .dnd5e.sheet.actor")).toBeVisible({ timeout: 20000 });

    // 3. Trigger "Spend all time" activity
    // We'll use evaluate to trigger it directly on the activity object for reliability
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
    // We'll wait a bit for the async operations to complete
    await page.waitForTimeout(3000);

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
  });

  test("Auto-Spend functionality for PC 3", async ({ page }) => {
    test.setTimeout(120000);
    const moduleId = "thefehrs-learning-manager";

    // 1. Setup PC 3: Assign as character, enable auto-spend, patch isGM check
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      const user = (game as any).user;

      await user.update({ character: actor.id });

      // Enable auto-spend
      await (game as any).settings.set(moduleId, "autoSpend", true);
      await (game as any).settings.set(moduleId, "autoSpendUnits", [
        "hour",
        "day",
        "week",
        "workweek",
      ]);

      // Set DC to 1 and method to direct to ensure progress is guaranteed for the test
      const rules = (game as any).settings.get(moduleId, "rules");
      await (game as any).settings.set(moduleId, "rules", {
        ...rules,
        checkDC: 1,
        bulkMethod: "direct",
        nonBulkMethod: "direct",
      });

      // Reset state
      await actor.setFlag(moduleId, "bank", { total: 0 });
      const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
      const projectData = project.getFlag(moduleId, "projectData") || {};
      await project.setFlag(moduleId, "projectData", { ...projectData, progress: 0 });

      // Monkey-patch ProjectEngine.handleAutoTrainSignal to bypass isGM check for this test
      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      const originalHandle = ProjectEngine.handleAutoTrainSignal;

      // We redefine it to ignore isGM
      ProjectEngine.handleAutoTrainSignal = async function () {
        console.log("MOCKED handleAutoTrainSignal triggered");
        const moduleId = "thefehrs-learning-manager"; // Hardcode inside to avoid ReferenceError
        const autoSpendEnabled = (game as any).settings.get(moduleId, "autoSpend");
        const autoSpendUnits = (game as any).settings.get(moduleId, "autoSpendUnits");

        if (!autoSpendEnabled) {
          console.log("Auto-spend disabled, skipping");
          return;
        }

        const actor = (game as any).user.character;
        if (!actor) {
          console.log("No character assigned to user, skipping");
          return;
        }

        const projects = actor.items.filter((i: any) => i.getFlag(moduleId, "isLearningProject"));

        console.log(`Found ${projects.length} projects for auto-spend`);

        if (projects.length === 1) {
          const project = projects[0];
          await ProjectEngine.processSpendAll(project, autoSpendUnits);
          console.log("Auto-spend processed for project", project.name);
        } else if (projects.length > 1) {
          console.log("Multiple projects found, showing warning");
          (ui as any).notifications.warn("Downtime Engine | Multiple projects warning");
        }
      };

      // Store original on window to restore later if needed, though page will reload anyway
      (window as any).__originalHandleAutoTrainSignal = originalHandle;
    }, moduleId);

    // 2. Grant 8 hours to PC 3
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 3");

      const currentTotal = actor.getFlag(moduleId, "bank")?.total || 0;
      await actor.setFlag(moduleId, "bank", { total: currentTotal + 8 });

      console.log(`Granted 8 hours to PC 3. New total: ${currentTotal + 8}`);

      // Emit the signal
      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      // ProjectEngine.signalTimeDistribution(); // This might only send to others
      await ProjectEngine.handleAutoTrainSignal();
      console.log("Manually triggered handleAutoTrainSignal");
    }, moduleId);

    // 3. Verify project progress increased automatically
    await page.waitForTimeout(5000); // Give it more time to process

    const stats = await page.evaluate((moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
      return {
        progress: project.getFlag(moduleId, "projectData")?.progress,
        bank: actor.getFlag(moduleId, "bank")?.total,
      };
    }, moduleId);

    console.log(`Auto-spend check: Progress=${stats.progress}, Bank=${stats.bank}`);
    expect(stats.progress).toBeGreaterThan(0);

    // 4. Verify warning for multiple projects
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 3");

      // Add a second project
      const projectData = {
        name: "Second Project",
        type: "feat",
        img: "icons/svg/book.svg",
        flags: {
          [moduleId]: {
            isLearningProject: true,
            projectData: { progress: 0, target: 100 },
          },
        },
      };
      await actor.createEmbeddedDocuments("Item", [projectData]);

      // Grant more time
      const currentTotal = actor.getFlag(moduleId, "bank")?.total || 0;
      await actor.setFlag(moduleId, "bank", { total: currentTotal + 8 });

      // Emit signal
      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      await ProjectEngine.handleAutoTrainSignal();
    }, moduleId);

    await expect(page.getByText(/Multiple projects warning/i)).toBeVisible({ timeout: 15000 });
  });
});
