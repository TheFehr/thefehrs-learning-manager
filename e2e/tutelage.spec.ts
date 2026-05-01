import { test, expect } from "./fixtures";

test.describe("Instructor and Tutelage System", () => {
  test("verify instructors and books filters and modifiers", async ({ page }) => {
    test.setTimeout(180000); // 3 minutes
    await page.goto("/game");

    // Wait for game to be ready
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    const moduleId = "thefehrs-learning-manager";

    // 1. Setup a completely dedicated actor and project
    await page.evaluate(async (moduleId) => {
      const actorName = "Tutelage Specialist";

      const existing = (game as any).actors.getName(actorName);
      if (existing) {
        await existing.delete();
      }

      // Create FRESH actor with plenty of GP
      const actor = await Actor.create({
        name: actorName,
        type: "character",
        img: "icons/svg/mystery-man.svg",
        system: { currency: { gp: 1000 } },
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

      // Add a BOOK from compendium - Ensure sourceId is set correctly
      const bookPack = (game as any).packs.get("world.test-learning-books");
      const bookIndex = await bookPack.getIndex();
      const bookEntry = bookIndex.find((e: any) => e.name === "Manual of Arms");
      if (bookEntry) {
        const bookUuid = `Compendium.world.test-learning-books.Item.${bookEntry._id}`;
        const bookItem = await fromUuid(bookUuid);
        const bookData = bookItem.toObject();
        bookData.flags = bookData.flags || {};
        bookData._stats = bookData._stats || {};
        bookData._stats.compendiumSource = bookUuid;

        await actor.createEmbeddedDocuments("Item", [bookData]);
      }

      // Create a MINIMAL feat
      const [item] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "Combat Training Project",
          type: "feat",
          system: { activities: {} },
          flags: {
            [moduleId]: {
              projectData: {
                target: 100,
                categories: ["Combat"],
              },
            },
          },
        },
      ]);

      // Grant time bank
      await actor.setFlag(moduleId, "bank", { total: 10 });

      // Use the Project Engine API to initiate it correctly
      // @ts-ignore
      const ProjectEngine = game.modules.get(moduleId).api.ProjectEngine;
      await ProjectEngine.initiateProjectFromItem(actor, item);

      // FORCE "direct" method for this test to ensure deterministic progress
      await (game as any).settings.set(moduleId, "rules", {
        ...(game as any).settings.get(moduleId, "rules"),
        nonBulkMethod: "direct",
      });
    }, moduleId);

    // 2. Open the dedicated Actor Sheet
    await page.evaluate(() => {
      const actor = (game as any).actors.getName("Tutelage Specialist");
      actor.sheet.render(true);
    });

    // Wait for sheet
    await expect(page.locator(".tidy5e-sheet, .dnd5e.sheet.actor")).toBeVisible({ timeout: 20000 });

    // 3. Trigger the training button via programmatic click
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("Tutelage Specialist");
      const project = actor.items.find((i: any) => i.getFlag(moduleId, "isLearningProject"));
      const activity = project.system.activities.contents.find((a: any) =>
        a.name.includes("Train"),
      );
      activity.use();
    }, moduleId);

    // 4. Verify InstructorSelectionDialog content
    const dialog = page.locator(".thefehrs-learning-manager-dialog, dialog").last();
    await expect(dialog).toBeVisible({ timeout: 20000 });

    // 5. Verify instructors/books are present
    await expect(dialog.getByText("Combat Master")).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText("Manual of Arms")).toBeVisible({ timeout: 10000 });

    // 6. Select Combat Master (+5, costs 20 GP)
    await dialog.locator("label").filter({ hasText: "Combat Master" }).click();

    // Count current messages to detect new one
    const initialMsgCount = await page.evaluate(() => (game as any).messages.size);

    await dialog.getByRole("button", { name: /Confirm/i }).click();

    // Wait for a new message to appear in data structure
    await page.waitForFunction(
      (initial) => (game as any).messages.size > initial,
      initialMsgCount,
      { timeout: 15000 },
    );

    // 8. Verify GP deduction (1000 - 20 = 980)
    const currentGp = await page.evaluate(() => {
      const actor = (game as any).actors.getName("Tutelage Specialist");
      return actor.system.currency.gp;
    });
    expect(currentGp).toBe(980);

    // 9. Verify progress increased in DATA
    const finalData = await page.evaluate((moduleId) => {
      const actor = (game as any).actors.getName("Tutelage Specialist");
      const project = actor.items.find((i: any) => i.getFlag(moduleId, "isLearningProject"));
      return {
        progress: project.getFlag(moduleId, "projectData").progress,
        bank: actor.getFlag(moduleId, "bank").total,
      };
    }, moduleId);

    expect(finalData.progress).toBe(1);
    expect(finalData.bank).toBe(9);
  });

  test("verify instructor fees block training if unaffordable", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/game");

    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready);

    const moduleId = "thefehrs-learning-manager";

    // 1. Setup a "Poor Student" actor
    await page.evaluate(async (moduleId) => {
      const actorName = "Poor Student";

      const existing = (game as any).actors.getName(actorName);
      if (existing) await existing.delete();

      // Create actor with 0 GP
      const actor = await Actor.create({
        name: actorName,
        type: "character",
        system: { currency: { gp: 0 } },
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

      // Create a Combat project
      const [item] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "Expensive Learning",
          type: "feat",
          system: { activities: {} },
          flags: {
            [moduleId]: {
              projectData: {
                target: 100,
                categories: ["Combat"],
              },
            },
          },
        },
      ]);

      await actor.setFlag(moduleId, "bank", { total: 10 });

      // @ts-ignore
      await game.modules.get(moduleId).api.ProjectEngine.initiateProjectFromItem(actor, item);

      // FORCE "direct" method
      await (game as any).settings.set(moduleId, "rules", {
        ...(game as any).settings.get(moduleId, "rules"),
        nonBulkMethod: "direct",
      });
    }, moduleId);

    // 2. Attempt to train with Combat Master (costs 20 GP = 2000 cp)
    await page.evaluate(() => {
      const actor = (game as any).actors.getName("Poor Student");
      actor.sheet.render(true);
    });

    await expect(page.locator(".tidy5e-sheet, .dnd5e.sheet.actor")).toBeVisible({ timeout: 15000 });

    // Programmatically trigger training
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("Poor Student");
      const project = actor.items.find((i: any) => i.getFlag(moduleId, "isLearningProject"));
      const activity = project.system.activities.contents.find((a: any) =>
        a.name.includes("Train"),
      );
      activity.use();
    }, moduleId);

    // 3. Select Combat Master in dialog
    const dialog = page.locator(".thefehrs-learning-manager-dialog, dialog").last();
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await dialog.locator("label").filter({ hasText: "Combat Master" }).click();
    await dialog.getByRole("button", { name: /Confirm/i }).click();

    // 4. Verify notification "Insufficient currency!" OR "Need 2000cp!"
    await expect(page.getByText(/Insufficient currency|Need 2000cp/i)).toBeVisible({
      timeout: 10000,
    });

    // 5. Verify no time deducted and no GP deducted
    const studentData = await page.evaluate((moduleId) => {
      const actor = (game as any).actors.getName("Poor Student");
      return {
        gp: actor.system.currency.gp,
        bank: actor.getFlag(moduleId, "bank").total,
      };
    }, moduleId);

    expect(studentData.gp).toBe(0);
    expect(studentData.bank).toBe(10);

    // 6. Close sheet, update currency, reopen sheet
    await page.evaluate(async () => {
      const actor = (game as any).actors.getName("Poor Student");
      await actor.sheet.close();
      await actor.update({ "system.currency.gp": 20 });
      await new Promise((r) => setTimeout(r, 1000));
      actor.sheet.render(true);
    });

    await expect(page.locator(".tidy5e-sheet, .dnd5e.sheet.actor")).toBeVisible({ timeout: 15000 });

    // Count current messages
    const initialMsgCount = await page.evaluate(() => (game as any).messages.size);

    // Trigger training again
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("Poor Student");
      const project = actor.items.find((i: any) => i.getFlag(moduleId, "isLearningProject"));
      const activity = project.system.activities.contents.find((a: any) =>
        a.name.includes("Train"),
      );
      activity.use();
    }, moduleId);

    // Select Combat Master again
    const reopenedDialog = page.locator(".thefehrs-learning-manager-dialog, dialog").last();
    await reopenedDialog.locator("label").filter({ hasText: "Combat Master" }).click();
    await reopenedDialog.getByRole("button", { name: /Confirm/i }).click();

    // Wait for message in data structure
    await page.waitForFunction(
      (initial) => (game as any).messages.size > initial,
      initialMsgCount,
      { timeout: 15000 },
    );

    // 8. Verify GP deducted and time deducted
    await page.waitForFunction(
      (moduleId) => {
        const actor = (game as any).actors.getName("Poor Student");
        const bank = actor.getFlag(moduleId, "bank")?.total;
        // We wait for the bank to be updated as a proxy for the entire transaction
        return bank === 9;
      },
      moduleId,
      { timeout: 15000 },
    );

    const finalStudentData = await page.evaluate((moduleId) => {
      const actor = (game as any).actors.getName("Poor Student");
      const cur = actor.system.currency;
      const totalCp =
        (Number(cur.pp) || 0) * 1000 +
        (Number(cur.gp) || 0) * 100 +
        (Number(cur.ep) || 0) * 50 +
        (Number(cur.sp) || 0) * 10 +
        (Number(cur.cp) || 0);
      return {
        gp: Number(cur.gp),
        totalCp,
        bank: actor.getFlag(moduleId, "bank").total,
      };
    }, moduleId);

    expect(finalStudentData.bank).toBe(9); // 1 hour used
    expect(finalStudentData.totalCp).toBe(0);
  });
});
