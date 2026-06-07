import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { ensureEditMode, waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-completion",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

    await page.evaluate(async (moduleId) => {
      const actor = await Actor.create({
        name: "PC 1",
        type: "character",
        img: "icons/svg/mystery-man.svg",
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

      const groupActor = await Actor.create({
        name: "Test Group",
        type: "group",
        flags: { core: { sheetClass: "dnd5e.Tidy5eGroupSheetQuadrone" } },
      });
      // @ts-ignore
      await groupActor.update({ "system.members": [{ actor: actor.id }] });

      const item = await Item.create({
        name: "Test Learning Feat",
        type: "feat",
        system: {
          description: { value: "A test feat for learning." },
          type: { value: "feat" },
          activities: {},
        },
        flags: {
          [moduleId]: {
            isLearningProject: true,
            projectData: { target: 100, requirements: [] },
          },
        },
        effects: [
          { name: "Test Effect", icon: "icons/svg/bolt.svg", disabled: false, changes: [] },
        ],
      });

      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      const project = await ProjectEngine.initiateProjectFromItem(actor, item);

      if (project) {
        const projectData = project.getFlag(moduleId, "projectData") || {};
        projectData.progress = 95;
        await ProjectEngine.updateItemWithProgress(project, projectData, "Self-Study", true);
      }

      await ProjectEngine.syncAllProjectActivities();
    }, moduleId);
  },
});

test.describe("Project Completion and Reward Restoration", () => {
  test("should complete a project and restore the original item state", async ({ page }) => {
    const actorName = "PC 1";
    const projectName = "Test Learning Feat";

    await page.evaluate((name) => {
      const actor = (game as any).actors.getName(name);
      actor.sheet.render(true);
    }, actorName);

    const actorSheet = page
      .locator(".window-app, .sheet.actor, .tidy5e-sheet, foundry-app")
      .filter({ hasText: actorName })
      .first();
    await expect(actorSheet).toBeVisible({ timeout: 15000 });

    const featuresTab = actorSheet
      .locator("a.item[data-tab='features'], [data-tidy-tab='features'], a:has-text('Features')")
      .first();
    if (await featuresTab.isVisible()) {
      await featuresTab.click({ force: true });
    }

    const projectRow = actorSheet
      .locator(".item-row, .item-table-row, .project-row")
      .filter({ hasText: projectName })
      .first();
    await expect(projectRow).toBeVisible({ timeout: 15000 });
    await expect(projectRow).toContainText("95/100");

    await page.evaluate(() => {
      const groupActor = (game as any).actors.find(
        (a: any) => a.name === "Test Group" && a.type === "group",
      );
      if (!groupActor) throw new Error("Test Group not found");
      groupActor.sheet.render(true);
    });

    const groupSheet = page
      .locator(".window-app, .application, .sheet")
      .filter({ hasText: "Test Group" })
      .first();
    await expect(groupSheet).toBeVisible({ timeout: 15000 });

    const groupLearningTab = groupSheet.getByRole("tab", { name: /Group Learning/i });
    await groupLearningTab.click({ force: true });

    await expect(
      groupSheet.locator(".thefehrs-party-tab .actor-container").filter({ hasText: actorName }),
    ).toBeVisible({ timeout: 15000 });

    await ensureEditMode(groupSheet.locator(".thefehrs-party-tab"));

    const pc1Section = groupSheet
      .locator(".thefehrs-party-tab section.tidy-table, .thefehrs-party-tab .actor-section")
      .filter({ hasText: actorName })
      .first();
    const projectRowInParty = pc1Section.locator(".project-row").filter({ hasText: projectName });
    const progressInput = projectRowInParty.locator("input.update-project-progress");
    await progressInput.fill("100");
    await page.keyboard.press("Enter");

    await page.evaluate(() => {
      const groupActor = (game as any).actors.find(
        (a: any) => a.name === "Test Group" && a.type === "group",
      );
      groupActor.sheet.close();
    });

    await expect(async () => {
      const has95 = await projectRow.textContent().then((t) => t?.includes("95/100"));
      expect(has95).toBe(false);
    }).toPass({ timeout: 15000 });

    const finalCheck = await page.evaluate(
      ({ actorName, projectName, moduleId }) => {
        const actor = (game as any).actors.getName(actorName);
        const item = actor.items.find((i: any) => i.name === projectName);
        return {
          exists: !!item,
          isProject: item?.getFlag(moduleId, "isLearningProject"),
          hasEffects: item?.effects?.size > 0,
        };
      },
      { actorName, projectName, moduleId },
    );

    expect(finalCheck.exists).toBe(true);
    expect(finalCheck.isProject).toBeFalsy();
    expect(finalCheck.hasEffects).toBe(true);
  });
});
