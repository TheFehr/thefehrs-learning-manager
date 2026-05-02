import { test, expect } from "./fixtures";

test.describe("GM Administrative Controls (Party Tab)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/game");
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });
  });

  test("GM can override progress, target, and abort projects", async ({ page }) => {
    test.setTimeout(120000);
    const moduleId = "thefehrs-learning-manager";

    // 1. Open the Party Tab via the "Test Group" actor
    await page.evaluate(async () => {
      const groupActor = (game as any).actors.getName("Test Group");
      if (!groupActor) throw new Error("Test Group not found");
      return groupActor.sheet.render(true);
    });

    // 2. Wait for Group Sheet and our custom tab
    await expect(page.locator(".tidy5e-sheet, .application, .window-app").first()).toBeVisible({
      timeout: 20000,
    });

    const partyTab = page.locator(".thefehrs-party-tab").first();
    // Click our tab if not already active
    const tabButton = page.getByRole("tab", { name: /Group Learning/i });
    if (await tabButton.isVisible()) {
      await tabButton.click();
    }

    await expect(partyTab).toBeVisible({ timeout: 15000 });

    // Function to ensure edit mode is enabled
    const ensureEditMode = async () => {
      const unlockIcon = partyTab.locator(".fa-unlock");
      if (!(await unlockIcon.isVisible())) {
        console.log("Enabling Edit Mode...");
        await partyTab.locator(".toggle-progress-edit").click();
        await expect(unlockIcon).toBeVisible();
      }
    };

    // 3. Enable Edit Mode
    await ensureEditMode();

    // 4. Locate PC 4's project row
    const pc4Id = await page.evaluate(() => (game as any).actors.getName("PC 4").id);
    console.log(`PC 4 ID: ${pc4Id}`);
    const pc4Section = partyTab.locator(`[data-tidy-section-key="actor-${pc4Id}"]`);
    await expect(pc4Section).toBeVisible();

    const projectRow = pc4Section
      .locator(".project-row")
      .filter({ hasText: /GM Override Project/i });
    await expect(projectRow).toBeVisible();

    // 5. Change Progress from 50 to 75 via UI
    console.log("Updating progress via UI...");
    const progressInput = projectRow.locator("input.update-project-progress");
    await expect(progressInput).toBeVisible();
    await progressInput.fill("75");
    await progressInput.press("Enter");

    // Wait for backend to update
    await page.waitForFunction(
      (moduleId) => {
        const actor = (game as any).actors.getName("PC 4");
        const project = actor.items.find((i: any) => i.name.includes("GM Override Project"));
        return project?.getFlag(moduleId, "projectData")?.progress === 75;
      },
      moduleId,
      { timeout: 10000 },
    );

    // Exit edit mode to verify read-only state
    const editModeToggle = partyTab.locator(".toggle-progress-edit");
    await editModeToggle.click();
    await expect(editModeToggle).toHaveAttribute("aria-checked", "false");

    // REAL-TIME UI CHECK: Verify UI reflects change immediately without reopen
    const progressTextImmediate = projectRow.locator(".progress-read-only");
    await expect(progressTextImmediate).toHaveText("75");

    // PERSISTENCE CHECK: Close and Reopen the sheet to ensure UI reflects saved state
    console.log("Persistence Check: Reopening sheet...");
    await page.locator('.window-header [data-action="close"]').first().click();
    await page.evaluate(async () => {
      const groupActor = (game as any).actors.getName("Test Group");
      return groupActor.sheet.render(true);
    });
    await expect(page.locator(".thefehrs-party-tab").first()).toBeVisible();
    if (await tabButton.isVisible()) await tabButton.click();

    // Verify UI reflects the change after reopen
    const progressText = page
      .locator(`[data-tidy-section-key="actor-${pc4Id}"]`)
      .locator(".project-row")
      .filter({ hasText: /GM Override Project/i })
      .locator(".progress-read-only");
    await expect(progressText).toHaveText("75");

    // 6. Change Target from 100 to 150 via UI
    console.log("Updating target via UI...");
    await ensureEditMode();

    // Re-locate project row
    const projectRowTarget = partyTab
      .locator(`[data-tidy-section-key="actor-${pc4Id}"]`)
      .locator(".project-row")
      .filter({ hasText: /GM Override Project/i });

    const targetInput = projectRowTarget.locator("input.update-project-target");
    await expect(targetInput).toBeVisible();
    await targetInput.fill("150");
    await targetInput.press("Enter");

    // Wait for backend
    await page.waitForFunction(
      (moduleId) => {
        const actor = (game as any).actors.getName("PC 4");
        const project = actor.items.find((i: any) => i.name.includes("GM Override Project"));
        return project?.getFlag(moduleId, "projectData")?.target === 150;
      },
      moduleId,
      { timeout: 10000 },
    );

    // PERSISTENCE CHECK: Verify UI target reflects the change
    console.log("Persistence Check: Verifying target UI...");
    await ensureEditMode(); // Re-enable to see input value or check read-only
    const targetValue = await page
      .locator(`[data-tidy-section-key="actor-${pc4Id}"]`)
      .locator(".project-row")
      .filter({ hasText: /GM Override Project/i })
      .locator(".update-project-target")
      .inputValue();
    expect(targetValue).toBe("150");

    // 7. Click Abort button
    console.log("Aborting project...");
    await ensureEditMode();

    const projectRowAbort = partyTab
      .locator(`[data-tidy-section-key="actor-${pc4Id}"]`)
      .locator(".project-row")
      .filter({ hasText: /GM Override Project/i });

    await projectRowAbort.locator(".delete-project").click();

    // 8. Confirm Abort dialog
    const abortDialog = page.locator(".thefehrs-learning-manager-dialog, dialog").last();
    await expect(abortDialog).toBeVisible({ timeout: 10000 });
    await expect(
      abortDialog.getByText(/Are you sure you want to abort the project/i),
    ).toBeVisible();

    await abortDialog.getByRole("button", { name: /Yes/i }).click();

    // 9. Verify project is removed from PC 4
    await page.waitForFunction(
      () => {
        const actor = (game as any).actors.getName("PC 4");
        return !actor.items.find((i: any) => i.name.includes("GM Override Project"));
      },
      { timeout: 10000 },
    );

    const projectExists = await page.evaluate(() => {
      const actor = (game as any).actors.getName("PC 4");
      return !!actor.items.find((i: any) => i.name.includes("GM Override Project"));
    });
    expect(projectExists).toBe(false);
  });
});
