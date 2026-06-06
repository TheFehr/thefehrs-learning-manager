import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-tutelage",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);
  },
});

test.describe("Instructor and Tutelage System", () => {
  test("verify instructors and books filters and modifiers", async ({ page }) => {
    await page.evaluate(async (moduleId) => {
      let instructor = (game as any).actors.getName("Combat Master");
      if (!instructor) {
        instructor = await Actor.create({
          name: "Combat Master",
          type: "npc",
          img: "icons/citizens/knights/knight-armor-plate-helmet.webp",
          flags: {
            [moduleId]: {
              learningModeEnabled: true,
              teacherOfferings: [
                {
                  name: "Combat Training",
                  modifier: 5,
                  costs: { hour: 2000 },
                  categories: ["Combat"],
                },
              ],
            },
          },
        });
      } else {
        await instructor.update({
          [`flags.${moduleId}.learningModeEnabled`]: true,
          [`flags.${moduleId}.teacherOfferings`]: [
            { name: "Combat Training", modifier: 5, costs: { hour: 2000 }, categories: ["Combat"] },
          ],
        });
      }

      await (game as any).settings.set(moduleId, "scanWorldActors", true);

      let actor = (game as any).actors.getName("Tutelage Specialist");
      if (actor) await actor.delete();

      actor = await Actor.create({
        name: "Tutelage Specialist",
        type: "character",
        img: "icons/svg/mystery-man.svg",
        system: { currency: { gp: 1000 } },
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

      await actor.createEmbeddedDocuments("Item", [
        {
          name: "Manual of Arms",
          type: "loot",
          img: "icons/sundries/books/book-warfare-brown.webp",
          flags: {
            [moduleId]: { learningBookBonus: { modifier: 1, categories: ["Combat"] } },
          },
        },
      ]);

      const [item] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "Combat Training Project",
          type: "feat",
          system: { type: { value: "learning-project" }, activities: {} },
          flags: {
            [moduleId]: {
              isLearningProject: true,
              projectData: { target: 100, categories: ["Combat"] },
            },
          },
        },
      ]);

      await actor.setFlag(moduleId, "bank", { total: 10 });

      const api = (game as any).modules.get(moduleId).api;
      await api.ProjectEngine.initiateProjectFromItem(actor, item);
      await api.ProjectEngine.syncAllProjectActivities();

      await (game as any).settings.set(moduleId, "rules", {
        ...(game as any).settings.get(moduleId, "rules"),
        nonBulkMethod: "direct",
      });
    }, moduleId);

    await page.evaluate(() => {
      const actor = (game as any).actors.getName("Tutelage Specialist");
      actor.sheet.render(true);
    });

    const sheet = page.locator(".window-app, .sheet.actor, foundry-app").first();
    await expect(sheet).toBeVisible({ timeout: 20000 });

    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("Tutelage Specialist");
      const project = actor.items.find((i: any) => i.getFlag(moduleId, "isLearningProject"));
      const activity = project.system.activities.contents.find((a: any) =>
        a.name.includes("Train"),
      );
      activity.use();
    }, moduleId);

    const dialog = page
      .locator(".thefehrs-learning-manager-dialog, .instructor-selection, .dialog")
      .first();
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog.getByText("Combat Master")).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText("Manual of Arms")).toBeVisible({ timeout: 10000 });

    await dialog.locator("label").filter({ hasText: "Combat Master" }).click();
    const initialMsgCount = await page.evaluate(() => (game as any).messages.size);
    await dialog.getByRole("button", { name: /Confirm/i }).click();

    await page.waitForFunction(
      (initial) => (game as any).messages.size > initial,
      initialMsgCount,
      { timeout: 15000 },
    );

    const currentGp = await page.evaluate(() => {
      const actor = (game as any).actors.getName("Tutelage Specialist");
      return actor.system.currency.gp;
    });
    expect(currentGp).toBe(980);
  });

  test("verify instructor fees block training if unaffordable", async ({ page }) => {
    await page.evaluate(async (moduleId) => {
      let instructor = (game as any).actors.getName("Combat Master");
      if (!instructor) {
        await Actor.create({
          name: "Combat Master",
          type: "npc",
          flags: {
            [moduleId]: {
              learningModeEnabled: true,
              teacherOfferings: [
                {
                  name: "Combat Training",
                  modifier: 5,
                  costs: { hour: 2000 },
                  categories: ["Combat"],
                },
              ],
            },
          },
        });
      }
      await (game as any).settings.set(moduleId, "scanWorldActors", true);

      let actor = (game as any).actors.getName("Poor Student");
      if (actor) await actor.delete();

      actor = await Actor.create({
        name: "Poor Student",
        type: "character",
        system: { currency: { gp: 0 } },
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

      const [item] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "Expensive Learning",
          type: "feat",
          system: { type: { value: "learning-project" }, activities: {} },
          flags: {
            [moduleId]: {
              isLearningProject: true,
              projectData: { target: 100, categories: ["Combat"] },
            },
          },
        },
      ]);

      await actor.setFlag(moduleId, "bank", { total: 10 });
      const api = (game as any).modules.get(moduleId).api;
      await api.ProjectEngine.initiateProjectFromItem(actor, item);
      await api.ProjectEngine.syncAllProjectActivities();

      await (game as any).settings.set(moduleId, "rules", {
        ...(game as any).settings.get(moduleId, "rules"),
        nonBulkMethod: "direct",
      });
    }, moduleId);

    await page.evaluate(() => {
      const actor = (game as any).actors.getName("Poor Student");
      actor.sheet.render(true);
    });

    const sheet = page.locator(".window-app, .sheet.actor, foundry-app").first();
    await expect(sheet).toBeVisible({ timeout: 15000 });

    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("Poor Student");
      const project = actor.items.find((i: any) => i.getFlag(moduleId, "isLearningProject"));
      const activity = project.system.activities.contents.find((a: any) =>
        a.name.includes("Train"),
      );
      activity.use();
    }, moduleId);

    const dialog = page
      .locator(".thefehrs-learning-manager-dialog, .instructor-selection, .dialog")
      .first();
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await dialog.locator("label").filter({ hasText: "Combat Master" }).click();
    await dialog.getByRole("button", { name: /Confirm/i }).click();

    await expect(page.getByText(/Insufficient currency|Need 2000cp/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test("verify world-created books are detected", async ({ page }) => {
    await page.evaluate(async (moduleId) => {
      let actor = (game as any).actors.getName("World Book User");
      if (actor) await actor.delete();

      actor = await Actor.create({
        name: "World Book User",
        type: "character",
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

      await actor.createEmbeddedDocuments("Item", [
        {
          name: "Custom World Book",
          type: "loot",
          flags: {
            [moduleId]: { learningBookBonus: { modifier: 3, categories: ["Magic"] } },
          },
        },
      ]);

      const [project] = await actor.createEmbeddedDocuments("Item", [
        {
          name: "Magic Project",
          type: "feat",
          system: { type: { value: "learning-project" }, activities: {} },
          flags: {
            [moduleId]: {
              isLearningProject: true,
              projectData: { target: 100, categories: ["Magic"] },
            },
          },
        },
      ]);

      await actor.setFlag(moduleId, "bank", { total: 10 });
      const api = (game as any).modules.get(moduleId).api;
      await api.ProjectEngine.initiateProjectFromItem(actor, project);
      await api.ProjectEngine.syncAllProjectActivities();

      await (game as any).settings.set(moduleId, "rules", {
        ...(game as any).settings.get(moduleId, "rules"),
        nonBulkMethod: "direct",
      });
    }, moduleId);

    await page.evaluate(() => {
      const actor = (game as any).actors.getName("World Book User");
      actor.sheet.render(true);
    });

    const sheet = page.locator(".window-app, .sheet.actor, foundry-app").first();
    await expect(sheet).toBeVisible({ timeout: 20000 });

    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("World Book User");
      const project = actor.items.find((i: any) => i.getFlag(moduleId, "isLearningProject"));
      const activity = project.system.activities.contents.find((a: any) =>
        a.name.includes("Train"),
      );
      activity.use();
    }, moduleId);

    const dialog = page
      .locator(".thefehrs-learning-manager-dialog, .instructor-selection, .dialog")
      .first();
    await expect(dialog).toBeVisible({ timeout: 20000 });

    const selfStudyOption = dialog.locator(".option").filter({ hasText: "Self-Study" });
    await expect(selfStudyOption).toContainText("Custom World Book");
    await expect(selfStudyOption).toContainText("+3");
  });
});
