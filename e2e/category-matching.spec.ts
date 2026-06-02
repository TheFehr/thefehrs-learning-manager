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
  deleteIfExists: true,
});

test.describe("Category Matching", () => {
  test("verify category filtering for books and instructors", async ({ page }) => {
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

    const moduleId = "thefehrs-learning-manager";

    // 1. Setup: Configure Module Settings
    await page.evaluate(async (moduleId) => {
      await (game as any).settings.set(moduleId, "scanWorldActors", true);
    }, moduleId);

    // 2. Setup: Create Projects, Books and Instructors with categories
    await page.evaluate(async (moduleId) => {
      // Create a dedicated actor
      const actorName = "Category Tester";
      const existing = (game as any).actors.getName(actorName);
      if (existing) await existing.delete();

      const actor = await Actor.create({
        name: actorName,
        type: "character",
        img: "icons/svg/mystery-man.svg",
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

      // Create an instructor in the world
      await Actor.create({
        name: "Athletics Coach",
        type: "npc",
        flags: {
          [moduleId]: {
            learningModeEnabled: true,
            teacherOfferings: [
              {
                name: "Athletics Drills",
                modifier: 3,
                costs: { hour: 500 },
                categories: ["Athletics"],
              },
            ],
          },
        },
      });

      // Create a book in the world
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "Arcana Tome",
          type: "loot",
          flags: {
            [moduleId]: {
              learningBookBonus: { modifier: 2, categories: ["Arcana"] },
            },
          },
        },
      ]);

      // Create two projects on the actor
      await actor.createEmbeddedDocuments("Item", [
        {
          name: "Arcana Study Project",
          type: "feat",
          system: { activities: {}, type: { value: "learning-project" } },
          flags: {
            [moduleId]: {
              isLearningProject: true,
              projectData: { target: 100, progress: 0, categories: ["Arcana"] },
            },
          },
        },
        {
          name: "Athletics Training Project",
          type: "feat",
          system: { activities: {}, type: { value: "learning-project" } },
          flags: {
            [moduleId]: {
              isLearningProject: true,
              projectData: { target: 100, progress: 0, categories: ["Athletics"] },
            },
          },
        },
      ]);

      await actor.setFlag(moduleId, "bank", { total: 10 });

      // Sync activities
      // @ts-ignore
      await game.modules.get(moduleId).api.ProjectEngine.syncAllProjectActivities();
    }, moduleId);

    // Open Actor Sheet
    await page.evaluate(() => {
      const actor = (game as any).actors.getName("Category Tester");
      actor.sheet.render(true);
    });

    // Wait for ANY window app or sheet
    await expect(
      page.locator(".window-app, .sheet.actor, .tidy5e-sheet, foundry-app").first(),
    ).toBeVisible({ timeout: 20000 });

    // 4. Test Athletics Project (should show Coach, NOT Tome)

    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("Category Tester");
      const project = actor.items.find((i: any) => i.name.includes("Athletics Training"));

      const activity = project.system.activities.find((a: any) =>
        a.name.toLowerCase().includes("train"),
      );

      if (!activity) {
        throw new Error(
          `Training activity not found on project. Activities count: ${project.system.activities.size}. Names: ${Array.from(
            project.system.activities,
          )
            .map((a: any) => a.name)
            .join(", ")}`,
        );
      }
      activity.use();
    }, moduleId);

    // Wait for our custom dialog content
    const dialog = page
      .locator(".thefehrs-learning-manager-dialog, .instructor-selection, .dialog")
      .first();
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Verify Coach is there
    await expect(dialog.locator("label").filter({ hasText: "Athletics Coach" })).toBeVisible();

    // Verify Arcana Tome is NOT there
    await expect(dialog.locator(".option").filter({ hasText: "Self-Study" })).not.toContainText(
      "Arcana Tome",
    );

    // Close dialog
    await page.keyboard.press("Escape");

    // 5. Test Arcana Project (should show Tome, NOT Coach)
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("Category Tester");
      const project = actor.items.find((i: any) => i.name.includes("Arcana Study"));
      const activity = project.system.activities.find((a: any) =>
        a.name.toLowerCase().includes("train"),
      );
      activity.use();
    }, moduleId);

    const dialog2 = page
      .locator(".thefehrs-learning-manager-dialog, .instructor-selection, .dialog")
      .first();
    await expect(dialog2).toBeVisible({ timeout: 15000 });

    // Verify Coach is NOT there
    await expect(dialog2.locator("label").filter({ hasText: "Athletics Coach" })).toBeHidden();

    // Verify Arcana Tome IS there in Self-Study
    await expect(dialog2.locator(".option").filter({ hasText: "Self-Study" })).toContainText(
      "Arcana Tome",
    );
  });
});
