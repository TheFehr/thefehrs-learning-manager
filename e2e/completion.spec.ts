import { test, expect } from "@playwright/test";

test.describe("Project Completion and Reward Restoration", () => {
  test("should complete a project and restore the original item state", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/game");

    // 1. Wait for game to be ready
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    const actorName = "PC 1";
    const projectName = "Test Learning Feat";

    // 2. Open the Actor Sheet for PC 1
    await page.evaluate((name) => {
      const actor = (game as any).actors.getName(name);
      actor.sheet.render(true);
    }, actorName);

    const actorId = await page.evaluate((name) => (game as any).actors.getName(name).id, actorName);
    const actorSheet = page.locator(
      `.window-app[id*="${actorId}"], .application[id*="${actorId}"]`,
    );
    await expect(actorSheet).toBeVisible({ timeout: 15000 });

    // Switch to Features tab
    const featuresTab = actorSheet.getByRole("tab", { name: /Features/i });
    if (await featuresTab.isVisible()) {
      await featuresTab.click();
    }

    // Verify project exists with 95/100
    const projectRow = actorSheet
      .locator(".item-row, .item-table-row")
      .filter({ hasText: projectName })
      .first();
    await expect(projectRow).toBeVisible({ timeout: 15000 });
    await expect(projectRow).toContainText("95/100");

    // 3. Open the Party Tab to grant progress via GM override
    await page.evaluate(() => {
      const groupActor = (game as any).actors.find(
        (a) => a.name === "Test Group" && a.type === "group",
      );
      if (!groupActor) throw new Error("Test Group not found");
      groupActor.sheet.render(true);
    });

    const groupSheet = page.locator(".window-app, .application").filter({ hasText: "Test Group" });
    await expect(groupSheet).toBeVisible({ timeout: 15000 });

    const groupLearningTab = groupSheet.getByRole("tab", { name: /Group Learning/i });
    await groupLearningTab.click();

    // Wait for the member to appear in the sidebar
    await expect(
      groupSheet.locator(".thefehrs-party-tab .actor-container").filter({ hasText: actorName }),
    ).toBeVisible({ timeout: 15000 });

    // Toggle edit mode
    await groupSheet.locator(".thefehrs-party-tab .toggle-progress-edit").click();

    // Find PC 1's section in Group Learning
    const pc1Section = groupSheet
      .locator(".thefehrs-party-tab section.tidy-table")
      .filter({ hasText: actorName });
    const projectRowInParty = pc1Section.locator(".project-row").filter({ hasText: projectName });
    const progressInput = projectRowInParty.locator("input.update-project-progress");
    await progressInput.fill("100");
    await progressInput.press("Enter");

    // Close the group sheet to avoid interception
    await page.evaluate(() => {
      const groupActor = (game as any).actors.find(
        (a) => a.name === "Test Group" && a.type === "group",
      );
      if (groupActor) groupActor.sheet.close();
    });

    // 4. Verify the "Learning Complete" notification appears
    // Foundry notifications are usually in #notifications
    const notification = page
      .locator("#notifications .notification")
      .filter({ hasText: /Learning Complete/i });
    await expect(notification).toBeVisible({ timeout: 15000 });

    // 5. Verify the project item name is restored on PC 1 sheet (removes progress indicator)
    // Since it's now a weapon, it might have moved to the Inventory tab
    const inventoryTab = actorSheet.getByRole("tab", { name: /Inventory/i }).first();
    if (await inventoryTab.isVisible()) {
      await inventoryTab.click();
    }

    const restoredItemRow = actorSheet
      .locator(".item-row, .item-table-row")
      .filter({ hasText: projectName })
      .first();

    await expect(restoredItemRow).toBeVisible({ timeout: 15000 });
    await expect(restoredItemRow).not.toContainText("100/100");

    // 6. Verify the item type is restored to its original type ('weapon')
    // We can check this via evaluate because it's hard to see in the UI without opening the item sheet
    const itemType = await page.evaluate(
      ({ actorName, projectName }) => {
        const actor = (game as any).actors.getName(actorName);
        const item = actor.items.find((i: any) => i.name === projectName);
        return item?.type;
      },
      { actorName, projectName },
    );

    expect(itemType).toBe("weapon");

    // 7. Verify the Active Effect is re-enabled and visible on the actor
    const hasActiveEffect = await page.evaluate(
      ({ actorName, projectName }) => {
        const actor = (game as any).actors.getName(actorName);
        // Completed items should have their effects restored
        const item = actor.items.find((i: any) => i.name === projectName);
        return item?.effects.size > 0 && !item?.effects.contents[0].disabled;
      },
      { actorName, projectName },
    );

    expect(hasActiveEffect).toBe(true);

    // 8. Verify learning activities (Spend Time) are removed from the item
    const hasLearningActivities = await page.evaluate(
      ({ actorName, projectName }) => {
        const actor = (game as any).actors.getName(actorName);
        const item = actor.items.find((i: any) => i.name === projectName);
        const activities = item?.system.activities || {};
        return Object.values(activities).some(
          (a: any) => a.flags?.["thefehrs-learning-manager"]?.isLearningActivity,
        );
      },
      { actorName, projectName },
    );

    expect(hasLearningActivities).toBe(false);

    console.log("Project completion and restoration test completed successfully");
  });
});
