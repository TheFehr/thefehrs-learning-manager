import { test, expect } from "./fixtures";

test.describe("Training Resolution Choice", () => {
  test("verify bulk vs separate resolution for PC 2", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/game");

    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready);

    const moduleId = "thefehrs-learning-manager";

    // 1. Configure settings for the test
    await page.evaluate(async (moduleId) => {
      // Set both methods to roll to trigger the resolution dialog
      await (game as any).settings.set(moduleId, "rules", {
        ...(game as any).settings.get(moduleId, "rules"),
        nonBulkMethod: "roll",
        bulkMethod: "roll",
        checkDC: 10,
      });

      const actor = (game as any).actors.getName("PC 2");
      // Ensure plenty of time in bank for Work Week (40 hours)
      await actor.setFlag(moduleId, "bank", { total: 100 });

      // Open sheet
      actor.sheet.render(true);
    }, moduleId);

    // 2. Wait for actor sheet
    await expect(page.locator(".tidy5e-sheet, .dnd5e.sheet.actor")).toBeVisible({ timeout: 20000 });

    // 3. Trigger "Work Week" training (bulk)
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 2");
      const project = actor.items.find((i: any) => i.name.includes("Bulk Training Project"));
      if (!project) {
        throw new Error("Project 'Bulk Training Project' not found!");
      }
      const activities = project.system.activities.contents;
      const workWeekActivity = activities.find((a: any) => a.name.includes("Work Week"));
      if (!workWeekActivity) {
        throw new Error("Work Week activity not found!");
      }
      workWeekActivity.use();
    }, moduleId);

    // 4. Verify Training Resolution dialog appears
    const dialog = page.locator(".thefehrs-learning-manager-dialog, dialog").last();
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(
      dialog.getByText(/How would you like to resolve this Work Week session?/i),
    ).toBeVisible();
    await expect(dialog.getByText(/Expected progress/i).first()).toBeVisible();

    // 5. Select "Use Bulk"
    const initialMsgCount = await page.evaluate(() => (game as any).messages.size);
    await dialog.getByRole("button", { name: /Use Bulk/i }).click();

    // 6. Verify messages in chat (1 roll + 1 card)
    await page.waitForFunction(
      (initial) => (game as any).messages.size - initial === 2,
      initialMsgCount,
      { timeout: 15000 },
    );

    const newMsgCountBulk = await page.evaluate(
      (initial) => (game as any).messages.size - initial,
      initialMsgCount,
    );
    expect(newMsgCountBulk).toBe(2);

    // 7. Re-attempt with "Roll separately"
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 2");
      const project = actor.items.find((i: any) => i.name.includes("Bulk Training Project"));
      const workWeekActivity = project.system.activities.contents.find((a: any) =>
        a.name.includes("Work Week"),
      );
      workWeekActivity.use();
    }, moduleId);

    const sepDialog = page.locator(".thefehrs-learning-manager-dialog, dialog").last();
    await expect(sepDialog).toBeVisible({ timeout: 15000 });

    const initialMsgCountSep = await page.evaluate(() => (game as any).messages.size);

    // Select "Roll separately"
    await sepDialog.getByRole("button", { name: /Roll separately/i }).click();

    // 8. Verify multiple rolls summarized + 1 card
    await page.waitForFunction(
      (initial) => (game as any).messages.size - initial === 1,
      initialMsgCountSep,
      { timeout: 15000 },
    );

    await expect(
      page.getByText(/Training complete: Gained .* progress from 40 separate rolls/i),
    ).toBeVisible({ timeout: 20000 });

    const newMsgCountSep = await page.evaluate(
      (initial) => (game as any).messages.size - initial,
      initialMsgCountSep,
    );
    expect(newMsgCountSep).toBe(1); // 1 item card
  });
});
