import {
  test,
  expect,
  useBaseWorld,
  disableTour,
  simulateFoundryDrop,
} from "@thefehr/foundry-playwright";
import { waitForGameReady, forceClick } from "./utils";

// The other e2e specs each cover one slice of this pipeline in isolation:
// item-learning-config.spec.ts tests the config UI, mass-edit.spec.ts tests
// Mass Edit mechanics, project-lifecycle.spec.ts tests granting/progress but
// seeds its project item directly via Item.create() (bypassing the GM-facing
// config UI and Mass Edit entirely). This spec instead walks the full,
// real path a GM would actually use: create + configure a project through
// the Mass Edit UI, grant it to a player by dragging it onto their sheet,
// then progress it to completion.
const moduleId = "thefehrs-learning-manager";
const actorName = "Full Lifecycle PC";
const projectName = "Full Lifecycle Project";
const packId = "world.full-lifecycle-projects";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-full-lifecycle",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

    await page.evaluate(
      async ({ moduleId, actorName, packId }) => {
        let pack = (game as any).packs.get(packId);
        if (pack) await pack.deleteCompendium();

        await foundry.documents.collections.CompendiumCollection.createCompendium({
          type: "Item",
          label: "Full Lifecycle Projects",
          name: "full-lifecycle-projects",
          package: "world",
        });

        const isV14 = (game as any).release.generation >= 14;
        const actor = await Actor.create({
          name: actorName,
          type: "character",
          img: "icons/svg/mystery-man.svg",
          flags: {
            core: {
              sheetClass: isV14
                ? "dnd5e.Tidy5eCharacterSheetQuadrone"
                : "dnd5e.Tidy5eCharacterSheet",
            },
          },
        });

        await (game as any).user.update({ character: actor.id });
        await (game as any).settings.set(moduleId, "allowedCompendiums", [packId]);
      },
      { moduleId, actorName, packId },
    );
  },
});

test.describe("Full Project Lifecycle (Mass Edit create -> grant -> complete)", () => {
  test("a project created and configured via Mass Edit can be granted and completed", async ({
    page,
  }) => {
    // --- Step 1: create + configure the project via the real Mass Edit UI ---
    const appId = await page.evaluate(async (mid) => {
      const menu = (game as any).settings.menus.get(`${mid}.massEditMenu`);
      if (!menu) throw new Error(`massEditMenu not found for ${mid}`);
      const app = new menu.type();
      await app.render(true);
      return app.id;
    }, moduleId);

    const massEditApp = page.locator(`[id="${appId}"], .window-app:has-text("Mass Edit")`).first();
    await expect(massEditApp).toBeVisible({ timeout: 20000 });
    await expect(massEditApp.locator(".loading-state")).toBeHidden({ timeout: 15000 });

    await forceClick(massEditApp.locator("button", { hasText: "Add / Create Project" }));
    await expect(massEditApp.locator(".add-entity-dialog")).toBeVisible();
    await forceClick(massEditApp.locator("button", { hasText: "Create New" }));

    await massEditApp.locator("input#new-name").fill(projectName);
    await massEditApp.locator("select#new-destination").evaluate((el: HTMLSelectElement, id) => {
      const opt = Array.from(el.options).find((o) => o.value === id);
      if (opt) el.value = opt.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, packId);

    await forceClick(massEditApp.locator(".create-mode button", { hasText: "Create" }));

    // Newly created entries auto-expand into their inline ItemLearningConfig editor.
    const projectCard = massEditApp.locator(".entity-card", { hasText: projectName });
    await expect(projectCard).toBeVisible({ timeout: 10000 });
    await projectCard.locator("#target-progress").fill("10");

    await expect(projectCard.locator(".auto-save-banner")).toContainText("All changes saved", {
      timeout: 10000,
    });

    // --- Step 2: grant it to a player by dragging it from the compendium ---
    const itemData = await page.evaluate(
      async ({ packId, projectName }) => {
        const pack = (game as any).packs.get(packId);
        const index = await pack.getIndex();
        const entry = index.find((e: any) => e.name === projectName);
        if (!entry) throw new Error(`Project ${projectName} not found in ${packId}`);
        return {
          type: "Item",
          uuid: `Compendium.${packId}.Item.${entry._id}`,
        };
      },
      { packId, projectName },
    );

    await page.evaluate((name) => {
      const actor = (game as any).actors.getName(name);
      return actor.sheet.render(true);
    }, actorName);

    const actorSheet = page
      .locator(".window-app, .sheet.actor, .tidy5e-sheet, foundry-app")
      .filter({ hasText: actorName })
      .first();
    await expect(actorSheet).toBeVisible({ timeout: 15000 });

    await simulateFoundryDrop(
      page,
      `:is(.window-app, .sheet.actor, .tidy5e-sheet, foundry-app):has-text("${actorName}")`,
      itemData,
    );

    const projectRow = actorSheet
      .locator(".project-row, .item-row, .item-table-row, [data-tidy-sheet-part='item-table-row']")
      .filter({ hasText: projectName })
      .first();
    await projectRow.scrollIntoViewIfNeeded();
    await expect(projectRow).toBeVisible({ timeout: 20000 });
    await expect(projectRow).toContainText("0/10");

    // --- Step 3: progress it to completion ---
    // The time-bank/instructor-distribution UI that actually earns this
    // progress is already covered end to end in project-lifecycle.spec.ts;
    // driving it directly here keeps this spec focused on the ground it
    // actually adds (creation-via-Mass-Edit and granting), not re-proving
    // mechanics tested elsewhere.
    const finalState = await page.evaluate(
      async ({ moduleId, actorName, projectName }) => {
        const actor = (game as any).actors.getName(actorName);
        const item = actor.items.find((i: any) => i.name.includes(projectName));
        const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
        const projectData = item.getFlag(moduleId, "projectData");

        await ProjectEngine.updateItemWithProgress(
          item,
          { ...projectData, progress: projectData.target },
          "Test",
          true,
        );
        await ProjectEngine.completeProject(item);

        const completedItem = actor.items.find(
          (i: any) => i.getFlag(moduleId, "isLearnedReward") === true,
        );
        return {
          found: !!completedItem,
          name: completedItem?.name,
          isLearningProject: completedItem?.getFlag(moduleId, "isLearningProject"),
        };
      },
      { moduleId, actorName, projectName },
    );

    expect(finalState.found).toBe(true);
    expect(finalState.name).toBe(projectName);
    expect(finalState.isLearningProject).toBe(false);
  });
});
