import { test, expect, useFoundry, waitForReady, loginAs } from "@thefehr/foundry-playwright";
import { clearFoundryOverlays, ensureEditMode, setupTourKiller, forceClick } from "./utils";

useFoundry(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  deleteIfExists: true,
});

test.describe("GM Administrative Controls (Party Tab)", () => {
  test.beforeEach(async ({ page }) => {
    await setupTourKiller(page.context());
    await page.goto("/game");
    await loginAs(page, "Gamemaster");
    await waitForReady(page);
    await clearFoundryOverlays(page);
    await page.waitForTimeout(2000);

    const moduleId = "thefehrs-learning-manager";

    // 0. Setup: Create Actor, Group, and Project
    await page.evaluate(async (moduleId) => {
      const actorName = "PC 4";
      let actor = (game as any).actors.getName(actorName);
      if (actor) await actor.delete();
      actor = await Actor.create({
        name: actorName,
        type: "character",
        img: "icons/svg/mystery-man.svg",
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

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

      const projectName = "GM Override Project";
      const item = await Item.create({
        name: projectName,
        type: "feat",
        system: {
          description: { value: "A project for GM override testing." },
          type: { value: "feat" },
          activities: {},
        },
        flags: {
          [moduleId]: {
            isLearningProject: true,
            projectData: { target: 100, requirements: [] },
          },
        },
      });

      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      const project = await ProjectEngine.initiateProjectFromItem(actor, item);

      if (project) {
        await project.update({ [`flags.${moduleId}.projectData.progress`]: 50 });
      }

      await ProjectEngine.syncAllProjectActivities();
    }, moduleId);
  });

  test("GM can override progress, target, and abort projects", async ({
    page,
    deprecationTracker,
  }) => {
    deprecationTracker.registerIgnore("Deprecated since Version DnD5e");
    const moduleId = "thefehrs-learning-manager";

    // 1. Open the Party Tab
    await page.evaluate(async () => {
      const groupActor = (game as any).actors.getName("Test Group");
      return groupActor.sheet.render(true);
    });

    await page.waitForTimeout(2000);

    // 2. Wait for Group Sheet - use the proven locator pattern from completion.spec.ts
    const groupSheet = page
      .locator(".window-app, .application, .sheet")
      .filter({ hasText: /Test Group/i })
      .first();
    await expect(groupSheet).toBeVisible({ timeout: 30000 });

    const tabButton = groupSheet.getByRole("tab", { name: /Group Learning/i });
    await forceClick(tabButton);

    const partyTab = groupSheet.locator(".thefehrs-party-tab").first();
    await expect(partyTab).toBeVisible({ timeout: 15000 });

    // 3. Enable Edit Mode
    await ensureEditMode(partyTab);

    // 4. Test Progress Override
    const projectRow = partyTab
      .locator(".project-row")
      .filter({ hasText: "GM Override Project" })
      .first();
    const progressInput = projectRow.locator("input.update-project-progress");

    await progressInput.clear();
    await progressInput.fill("75");
    await progressInput.press("Enter");

    await expect(async () => {
      const actualProgress = await page.evaluate((moduleId) => {
        const actor = (game as any).actors.getName("PC 4");
        const project = actor.items.find((i: any) => i.name.includes("GM Override Project"));
        return project?.getFlag(moduleId, "projectData")?.progress;
      }, moduleId);
      expect(actualProgress).toBe(75);
    }).toPass({ timeout: 10000 });

    // Actor update re-mounts the Svelte tab component, resetting isEditMode to false.
    // Re-enable edit mode before accessing the target input.
    await ensureEditMode(partyTab);

    // 5. Test Target Override
    const targetInput = projectRow.locator("input.update-project-target");
    await targetInput.clear();
    await targetInput.fill("150");
    await targetInput.press("Enter");

    await expect(async () => {
      const actualTarget = await page.evaluate((moduleId) => {
        const actor = (game as any).actors.getName("PC 4");
        const project = actor.items.find((i: any) => i.name.includes("GM Override Project"));
        return project?.getFlag(moduleId, "projectData")?.target;
      }, moduleId);
      expect(actualTarget).toBe(150);
    }).toPass({ timeout: 10000 });

    // 6. Test Abort Project — re-enable edit mode again after target DB write
    await ensureEditMode(partyTab);
    const abortBtn = projectRow.locator("button[aria-label='Abort Project']");
    await forceClick(abortBtn);

    const dialog = page
      .locator(".window-app, .application")
      .filter({ hasText: /Abort Project/i })
      .first();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await forceClick(dialog.getByRole("button", { name: /Yes/i }));

    await expect(async () => {
      const exists = await page.evaluate(() => {
        const actor = (game as any).actors.getName("PC 4");
        return !!actor.items.find((i: any) => i.name.includes("GM Override Project"));
      });
      expect(exists).toBe(false);
    }).toPass({ timeout: 10000 });
  });
});
