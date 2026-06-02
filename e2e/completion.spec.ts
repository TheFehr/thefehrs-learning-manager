import { test, expect, useFoundry, waitForReady, loginAs } from "@thefehr/foundry-playwright";
import { clearFoundryOverlays, ensureEditMode, setupTourKiller } from "./utils";

useFoundry(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  deleteIfExists: true,
});

test.describe("Project Completion and Reward Restoration", () => {
  test("should complete a project and restore the original item state", async ({ page }) => {
    await setupTourKiller(page.context());
    await page.goto("/game");
    await loginAs(page, "Gamemaster");
    await waitForReady(page);
    await clearFoundryOverlays(page);

    const moduleId = "thefehrs-learning-manager";
    const actorName = "PC 1";
    const projectName = "Test Learning Feat";

    // 1. Setup: Create Actor, Group, and Project
    await page.evaluate(
      async ({ moduleId, actorName, projectName }) => {
        // Create Actor
        let actor = (game as any).actors.getName(actorName);
        if (actor) await actor.delete();

        actor = await Actor.create({
          name: actorName,
          type: "character",
          img: "icons/svg/mystery-man.svg",
          flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
        });

        // Create Group Actor
        let groupActor = (game as any).actors.find(
          (a: any) => a.name === "Test Group" && a.type === "group",
        );
        if (groupActor) await groupActor.delete();
        groupActor = await Actor.create({
          name: "Test Group",
          type: "group",
          flags: { core: { sheetClass: "dnd5e.Tidy5eGroupSheetQuadrone" } },
        });
        // @ts-ignore
        await groupActor.update({ "system.members": [{ actor: actor.id }] });

        // Create Item to learn
        const item = await Item.create({
          name: projectName,
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
            {
              name: "Test Effect",
              icon: "icons/svg/bolt.svg",
              disabled: false,
              changes: [],
            },
          ],
        });

        // Initiate Project
        const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
        const project = await ProjectEngine.initiateProjectFromItem(actor, item);

        // Set progress to 95/100
        if (project) {
          const projectData = project.getFlag(moduleId, "projectData") || {};
          projectData.progress = 95;
          await ProjectEngine.updateItemWithProgress(project, projectData, "Self-Study", true);
        }

        // Sync activities
        await ProjectEngine.syncAllProjectActivities();
      },
      { moduleId, actorName, projectName },
    );

    // 2. Open the Actor Sheet for PC 1
    await page.evaluate((name) => {
      const actor = (game as any).actors.getName(name);
      actor.sheet.render(true);
    }, actorName);

    const actorSheet = page
      .locator(".window-app, .sheet.actor, .tidy5e-sheet, foundry-app")
      .filter({ hasText: actorName })
      .first();
    await expect(actorSheet).toBeVisible({ timeout: 15000 });

    // Switch to Features tab
    const featuresTab = actorSheet
      .locator("a.item[data-tab='features'], [data-tidy-tab='features'], a:has-text('Features')")
      .first();
    if (await featuresTab.isVisible()) {
      await featuresTab.click({ force: true });
    }

    // Verify project exists with 95/100
    const projectRow = actorSheet
      .locator(".item-row, .item-table-row, .project-row")
      .filter({ hasText: projectName })
      .first();
    await expect(projectRow).toBeVisible({ timeout: 15000 });
    await expect(projectRow).toContainText("95/100");

    // 3. Open the Party Tab to grant progress via GM override
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

    // Wait for the member to appear in the sidebar
    await expect(
      groupSheet.locator(".thefehrs-party-tab .actor-container").filter({ hasText: actorName }),
    ).toBeVisible({ timeout: 15000 });

    // Enable Edit Mode
    await ensureEditMode(groupSheet.locator(".thefehrs-party-tab"));

    // Find PC 1's section in Group Learning
    const pc1Section = groupSheet
      .locator(".thefehrs-party-tab section.tidy-table, .thefehrs-party-tab .actor-section")
      .filter({ hasText: actorName })
      .first();
    const projectRowInParty = pc1Section.locator(".project-row").filter({ hasText: projectName });
    const progressInput = projectRowInParty.locator("input.update-project-progress");
    await progressInput.fill("100");
    await progressInput.press("Enter");

    // Close the group sheet to avoid interception
    await page.evaluate(() => {
      const groupActor = (game as any).actors.find(
        (a: any) => a.name === "Test Group" && a.type === "group",
      );
      groupActor.sheet.close();
    });

    // 4. Verify Completion on Actor Sheet
    await expect(async () => {
      const has95 = await projectRow.textContent().then((t) => t?.includes("95/100"));
      expect(has95).toBe(false);
    }).toPass({ timeout: 15000 });

    // Verify it's now just a normal feat again
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
