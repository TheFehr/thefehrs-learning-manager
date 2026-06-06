import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-resolution",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

    await page.evaluate(async (moduleId) => {
      const actor = await Actor.create({
        name: "PC 2",
        type: "character",
        img: "icons/svg/mystery-man.svg",
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

      const item = await Item.create({
        name: "Bulk Training Project",
        type: "feat",
        system: {
          description: { value: "A project for bulk training resolution testing." },
          type: { value: "feat" },
          activities: {},
        },
        flags: {
          [moduleId]: {
            isLearningProject: true,
            projectData: { target: 1000, progress: 0, requirements: [] },
          },
        },
      });

      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      await ProjectEngine.initiateProjectFromItem(actor, item);

      await actor.setFlag(moduleId, "bank", { total: 100 });

      await (game as any).settings.set(moduleId, "timeUnits", [
        { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
        { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
        { id: "workweek", name: "Work Week", short: "ww", isBulk: true, ratio: 40 },
        { id: "week", name: "Week", short: "w", isBulk: true, ratio: 70 },
      ]);

      await ProjectEngine.syncAllProjectActivities();
    }, moduleId);
  },
});

test.describe("Training Resolution Choice", () => {
  test("verify bulk vs separate resolution for PC 2", async ({ page }) => {
    await page.evaluate(async (moduleId) => {
      await (game as any).settings.set(moduleId, "rules", {
        ...(game as any).settings.get(moduleId, "rules"),
        nonBulkMethod: "roll",
        bulkMethod: "roll",
        checkDC: 10,
      });

      const actor = (game as any).actors.getName("PC 2");
      actor.sheet.render(true);
    }, moduleId);

    await expect(
      page
        .locator(".window-app, .sheet.actor, .tidy5e-sheet, foundry-app")
        .filter({ hasText: "PC 2" })
        .first(),
    ).toBeVisible({ timeout: 20000 });

    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 2");
      const project = actor.items.find((i: any) => i.name.includes("Bulk Training Project"));
      if (!project) throw new Error("Project 'Bulk Training Project' not found!");
      const activities =
        project.system.activities.contents || Object.values(project.system.activities);
      const workWeekActivity = activities.find((a: any) => a.name.includes("Work Week"));
      if (!workWeekActivity) throw new Error("Work Week activity not found!");
      workWeekActivity.use();
    }, moduleId);

    const dialog = page
      .locator(".thefehrs-learning-manager-dialog, .instructor-selection, .dialog, dialog")
      .last();
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(
      dialog.getByText(/How would you like to resolve this Work Week session?/i),
    ).toBeVisible();

    const initialMsgCount = await page.evaluate(() => (game as any).messages.size);
    await dialog.getByRole("button", { name: /Use Bulk/i }).click();

    await page.waitForFunction(
      (initial) => (game as any).messages.size - initial >= 1,
      initialMsgCount,
      { timeout: 15000 },
    );

    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 2");
      const project = actor.items.find((i: any) => i.name.includes("Bulk Training Project"));
      const activities =
        project.system.activities.contents || Object.values(project.system.activities);
      const workWeekActivity = activities.find((a: any) => a.name.includes("Work Week"));
      workWeekActivity.use();
    }, moduleId);

    const sepDialog = page
      .locator(".thefehrs-learning-manager-dialog, .instructor-selection, .dialog, dialog")
      .last();
    await expect(sepDialog).toBeVisible({ timeout: 15000 });

    const initialMsgCountSep = await page.evaluate(() => (game as any).messages.size);

    await sepDialog.getByRole("button", { name: /Roll separately/i }).click();

    await page.waitForFunction(
      (initial) => (game as any).messages.size - initial >= 1,
      initialMsgCountSep,
      { timeout: 15000 },
    );

    await expect(
      page.getByText(/Training complete: Gained .* progress from 40 hours/i),
    ).toBeVisible({ timeout: 20000 });
  });
});
