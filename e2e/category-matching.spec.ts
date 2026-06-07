import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-category-matching",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

    await page.evaluate(async (moduleId) => {
      await (game as any).settings.set(moduleId, "scanWorldActors", true);

      const actor = await Actor.create({
        name: "Category Tester",
        type: "character",
        img: "icons/svg/mystery-man.svg",
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

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

      await actor.createEmbeddedDocuments("Item", [
        {
          name: "Arcana Tome",
          type: "loot",
          flags: {
            [moduleId]: { learningBookBonus: { modifier: 2, categories: ["Arcana"] } },
          },
        },
      ]);

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

      // @ts-ignore
      await game.modules.get(moduleId).api.ProjectEngine.syncAllProjectActivities();
    }, moduleId);
  },
});

test.describe("Category Matching", () => {
  test("verify category filtering for books and instructors", async ({ page }) => {
    await page.evaluate(() => {
      const actor = (game as any).actors.getName("Category Tester");
      actor.sheet.render(true);
    });

    await expect(
      page.locator(".window-app, .sheet.actor, .tidy5e-sheet, foundry-app").first(),
    ).toBeVisible({ timeout: 20000 });

    // Athletics project: should show Coach, NOT Tome
    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("Category Tester");
      const project = actor.items.find((i: any) => i.name.includes("Athletics Training"));
      const activity = project.system.activities.find((a: any) =>
        a.name.toLowerCase().includes("train"),
      );
      if (!activity) {
        throw new Error(
          `Training activity not found. Activities: ${Array.from(project.system.activities)
            .map((a: any) => a.name)
            .join(", ")}`,
        );
      }
      activity.use();
    }, moduleId);

    const dialog = page
      .locator(".thefehrs-learning-manager-dialog, .instructor-selection, .dialog")
      .first();
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog.locator("label").filter({ hasText: "Athletics Coach" })).toBeVisible();
    await expect(dialog.locator(".option").filter({ hasText: "Self-Study" })).not.toContainText(
      "Arcana Tome",
    );

    await page.keyboard.press("Escape");

    // Arcana project: should show Tome, NOT Coach
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
    await expect(dialog2.locator("label").filter({ hasText: "Athletics Coach" })).toBeHidden();
    await expect(dialog2.locator(".option").filter({ hasText: "Self-Study" })).toContainText(
      "Arcana Tome",
    );
  });
});
