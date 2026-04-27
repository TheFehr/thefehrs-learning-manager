import { test, expect } from "@playwright/test";

test.describe("Project Lifecycle (Happy Path)", () => {
  test("should start and progress a project on an actor", async ({ page }) => {
    test.setTimeout(180000);
    await page.goto("/game");

    // 1. Wait for game to be ready
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    const actorName = "PC 1";
    const projectName = "Test Learning Feat";
    const packId = "world.test-learning-feats";

    // 2. Open the Actor Sheet for PC 1
    await page.evaluate((name) => {
      const actor = (game as any).actors.getName(name);
      actor.sheet.render(true);
    }, actorName);

    // Tidy5e might not use standard heading roles for the actor name in the header
    const actorSheet = page.locator(".window-app, .application").filter({ hasText: actorName });
    await expect(actorSheet).toBeVisible({ timeout: 15000 });

    // Switch to Features tab to ensure we can see the project
    const featuresTab = actorSheet.getByRole("tab", { name: /Features/i });
    if (await featuresTab.isVisible()) {
      await featuresTab.click();
    }

    // 3. Start a project by "dropping" an item from a compendium onto the actor
    // We simulate the drop event to avoid flakiness with real drag-and-drop in Foundry
    await page.evaluate(
      async ({ packId, projectName, actorName }) => {
        const pack = (game as any).packs.get(packId);
        const index = await pack.getIndex();
        const entry = index.find((e) => e.name === projectName);
        if (!entry) throw new Error(`Project ${projectName} not found in ${packId}`);

        const actor = (game as any).actors.getName(actorName);
        const data = {
          type: "Item",
          uuid: `Compendium.${packId}.Item.${entry._id}`,
        };

        // Trigger the drop hook manually
        const sheet = actor.sheet;
        const event = new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer(),
        });

        // Foundry's drop handling expects the data in the dataTransfer
        event.dataTransfer?.setData("text/plain", JSON.stringify(data));

        // Dispatch to the window content
        const target =
          document.querySelector(`.window-app[id="${sheet.id}"] .window-content`) ||
          document.getElementById(sheet.id)?.querySelector(".window-content");
        target?.dispatchEvent(event);
      },
      { packId, projectName, actorName },
    );

    // 4. Verify the project appeared on the actor sheet
    const projectRow = actorSheet
      .locator(".project-row, .item-row, .item-table-row")
      .filter({ hasText: projectName })
      .first();
    await expect(projectRow).toBeVisible({ timeout: 15000 });

    // 5. Open the Party Tab to grant time
    // First, we need to find the "Test Group" actor which has the Party Tab
    await page.evaluate(() => {
      const groupActor = (game as any).actors.find(
        (a) => a.name === "Test Group" && a.type === "group",
      );
      if (!groupActor) throw new Error("Test Group not found");
      groupActor.sheet.render(true);
    });

    const groupSheet = page.locator(".window-app, .application").filter({ hasText: "Test Group" });
    await expect(groupSheet).toBeVisible({ timeout: 15000 });

    // Switch to the "Group Learning" tab in Tidy5e
    const groupLearningTab = groupSheet.getByRole("tab", { name: /Group Learning/i });
    await groupLearningTab.click();

    // 6. Click "Distribute Time" button in the Party Tab
    const distributeBtn = groupSheet.getByRole("button", { name: /Distribute Time/i });
    await expect(distributeBtn).toBeVisible({ timeout: 15000 });
    await distributeBtn.click();

    // 7. Fill the Grant Time dialog
    // The dialog title is "Modify Training Time" per PartyTabLogic.ts
    const grantDialog = page
      .locator(".window-app, .application")
      .filter({ hasText: "Modify Training Time" });
    await expect(grantDialog).toBeVisible({ timeout: 15000 });

    // Set 8 hours
    const hourInput = grantDialog.locator('input[type="number"]').first();
    await hourInput.fill("8");

    // Submit via the "Apply Time" button (DialogV2 button)
    const applyBtn = grantDialog.getByRole("button", { name: "Apply Time" });
    await applyBtn.click();

    // 8. Verify progress increased on the PC's sheet
    // PC 1's sheet should still be open from earlier
    await page.bringToFront(); // Ensure we're looking at the right place if needed
    await expect(projectRow).not.toContainText("0 / 100", { timeout: 30000 });

    console.log("Project lifecycle test completed successfully");
  });
});
