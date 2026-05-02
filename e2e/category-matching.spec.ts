import { test, expect } from "./fixtures";

test.describe("Category Matching", () => {
  test("verify category filtering for books and instructors", async ({ page }) => {
    test.setTimeout(240000);
    await page.goto("/game");

    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    const moduleId = "thefehrs-learning-manager";

    // 1. Setup: Create Projects, Books and Instructors with categories
    await page.evaluate(async (moduleId) => {
      const actorName = "Category Tester";
      const existing = (game as any).actors.getName(actorName);
      if (existing) await existing.delete();

      const actor = await Actor.create({
        name: actorName,
        type: "character",
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

      // Create Projects
      const [arcanaProj, athleticsProj] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "Arcana Study",
          type: "feat",
          flags: { [moduleId]: { projectData: { target: 100, categories: ["Arcana"] } } },
        },
        {
          name: "Athletics Training",
          type: "feat",
          flags: { [moduleId]: { projectData: { target: 100, categories: ["Athletics"] } } },
        },
      ]);

      // Create Books in inventory
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "Arcana Tome",
          type: "loot",
          flags: { [moduleId]: { learningBookBonus: { modifier: 5, categories: ["Arcana"] } } },
        },
        {
          name: "Universal Primer",
          type: "loot",
          flags: { [moduleId]: { learningBookBonus: { modifier: 2, categories: [] } } },
        },
      ]);

      // Create an Instructor (another actor) directly in the world
      const coachName = "Athletics Coach";
      const existingCoach = (game as any).actors.getName(coachName);
      if (existingCoach) await existingCoach.delete();

      const coach = await Actor.create({
        name: coachName,
        type: "npc",
        flags: {
          [moduleId]: {
            learningModeEnabled: true,
            teacherOfferings: [
              {
                name: "Pro Training",
                modifier: 10,
                categories: ["Athletics"],
                costs: {},
              },
            ],
          },
        },
      });

      // Configure settings
      await (game as any).settings.set(moduleId, "bookCompendiums", []);
      await (game as any).settings.set(moduleId, "teacherCompendiums", []);
      await (game as any).settings.set(moduleId, "scanWorldActors", true);

      // Initiate projects
      // @ts-ignore
      const ProjectEngine = game.modules.get(moduleId).api.ProjectEngine;
      await ProjectEngine.initiateProjectFromItem(actor, arcanaProj);
      await ProjectEngine.initiateProjectFromItem(actor, athleticsProj);

      await actor.setFlag(moduleId, "bank", { total: 10 });
    }, moduleId);

    // 2. Test Arcana Project
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("Category Tester");
      actor.sheet.render(true);
    });
    await expect(page.locator(".tidy5e-sheet")).toBeVisible({ timeout: 20000 });

    // Open Arcana training
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("Category Tester");
      const project = actor.items.find(
        (i: any) => i.name.includes("Arcana Study") && i.getFlag(moduleId, "isLearningProject"),
      );
      // @ts-ignore
      const activity = project.system.activities.contents.find((a: any) =>
        a.name.includes("Train"),
      );
      activity.use();
    }, moduleId);

    const dialog = page.locator(".thefehrs-learning-manager-dialog, dialog").last();
    await expect(dialog).toBeVisible({ timeout: 20000 });

    // Verify Arcana Tome is there (it's the best matching book)
    await expect(dialog.locator(".option").filter({ hasText: "Self-Study" })).toContainText(
      "Arcana Tome",
    );
    await expect(dialog.locator(".option").filter({ hasText: "Self-Study" })).toContainText("+5");

    // Verify Universal Primer is NOT there (it matches but is worse than Arcana Tome)
    await expect(dialog.locator(".option").filter({ hasText: "Self-Study" })).not.toContainText(
      "Universal Primer",
    );

    // Verify Athletics Coach is NOT there
    await expect(dialog.locator(".option").filter({ hasText: "Athletics Coach" })).toBeHidden();

    // Close dialog
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    // 3. Test Athletics Project
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("Category Tester");
      const project = actor.items.find(
        (i: any) =>
          i.name.includes("Athletics Training") && i.getFlag(moduleId, "isLearningProject"),
      );
      // @ts-ignore
      const activity = project.system.activities.contents.find((a: any) =>
        a.name.includes("Train"),
      );
      activity.use();
    }, moduleId);

    await expect(dialog).toBeVisible({ timeout: 20000 });

    // Verify Universal Primer and Athletics Coach are there
    await expect(dialog.locator(".option").filter({ hasText: "Self-Study" })).toContainText(
      "Universal Primer",
    );
    await expect(dialog.locator(".option").filter({ hasText: "Athletics Coach" })).toBeVisible();

    // Verify Arcana Tome is NOT there
    await expect(dialog.locator(".option").filter({ hasText: "Self-Study" })).not.toContainText(
      "Arcana Tome",
    );
  });
});
