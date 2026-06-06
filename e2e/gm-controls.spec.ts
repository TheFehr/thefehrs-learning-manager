import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { ensureEditMode, forceClick, waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-gm-controls",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

    await page.evaluate(async (moduleId) => {
      const actor = await Actor.create({
        name: "PC 4",
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
        name: "GM Override Project",
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
  },
});

test.describe("GM Administrative Controls (Party Tab)", () => {
  test("GM can override progress, target, and abort projects", async ({
    page,
    deprecationTracker,
  }) => {
    deprecationTracker.registerIgnore("Deprecated since Version DnD5e");

    await page.evaluate(async () => {
      const groupActor = (game as any).actors.getName("Test Group");
      return groupActor.sheet.render(true);
    });

    await page.waitForTimeout(2000);

    const groupSheet = page
      .locator(".window-app, .application, .sheet")
      .filter({ hasText: /Test Group/i })
      .first();
    await expect(groupSheet).toBeVisible({ timeout: 30000 });

    const tabButton = groupSheet.getByRole("tab", { name: /Group Learning/i });
    await forceClick(tabButton);

    const partyTab = groupSheet.locator(".thefehrs-party-tab").first();
    await expect(partyTab).toBeVisible({ timeout: 15000 });

    await ensureEditMode(partyTab);

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

    await ensureEditMode(partyTab);

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
