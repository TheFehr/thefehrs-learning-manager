import {
  test,
  expect,
  useBaseWorld,
  disableTour,
  simulateFoundryDrop,
} from "@thefehr/foundry-playwright";
import { waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";
const actorName = "PC 1";
const projectName = "Test Learning Feat";
const packId = "world.test-learning-feats";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-lifecycle",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

    await page.evaluate(
      async ({ moduleId, actorName, projectName, packId }) => {
        let pack = (game as any).packs.get(packId);
        if (pack) await pack.deleteCompendium();

        // @ts-ignore
        await foundry.documents.collections.CompendiumCollection.createCompendium({
          type: "Item",
          label: "Test Learning Feats",
          name: "test-learning-feats",
          package: "world",
        });
        pack = (game as any).packs.get(packId);

        await Item.create(
          {
            name: projectName,
            type: "feat",
            img: "icons/skills/trades/smithing-anvil-silver.webp",
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
          },
          { pack: packId },
        );

        const actor = await Actor.create({
          name: actorName,
          type: "character",
          img: "icons/svg/mystery-man.svg",
          system: { currency: { gp: 100 } },
          flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
        });

        const groupActor = await Actor.create({
          name: "Test Group",
          type: "group",
          flags: { core: { sheetClass: "dnd5e.Tidy5eGroupSheetQuadrone" } },
        });
        // @ts-ignore
        await groupActor.update({ "system.members": [{ actor: actor.id }] });

        await (game as any).user.update({ character: actor.id });
        await (game as any).settings.set(moduleId, "autoSpend", true);
        await (game as any).settings.set(moduleId, "autoSpendUnits", [
          "hour",
          "day",
          "workweek",
          "week",
        ]);

        const rules = (game as any).settings.get(moduleId, "rules");
        await (game as any).settings.set(moduleId, "rules", {
          ...rules,
          checkDC: 1,
          bulkMethod: "direct",
          nonBulkMethod: "direct",
        });
      },
      { moduleId, actorName, projectName, packId },
    );
  },
});

test.describe("Project Lifecycle (Happy Path)", () => {
  test("should start and progress a project on an actor", async ({ page, deprecationTracker }) => {
    deprecationTracker.registerIgnore("Deprecated since Version DnD5e");

    // Patch handleAutoTrainSignal to bypass the GM check for this E2E test
    await page.evaluate(async (moduleId) => {
      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      ProjectEngine.handleAutoTrainSignal = async function () {
        const actor = (game as any).user.character;
        if (!actor) return;
        const projects = actor.items.filter(
          (i: any) =>
            i.getFlag(moduleId, "isLearningProject") &&
            (i.name.includes("0/100") || i.name.includes("Test Learning Feat")),
        );
        if (projects.length >= 1) {
          await ProjectEngine.processSpendAll(projects[0], ["hour", "day", "workweek", "week"]);
        }
      };
    }, moduleId);

    await page.evaluate((name) => {
      const actor = (game as any).actors.getName(name);
      return actor.sheet.render(true);
    }, actorName);

    const actorSheet = page
      .locator(".window-app, .sheet.actor, .tidy5e-sheet, foundry-app")
      .filter({ hasText: actorName })
      .first();
    await expect(actorSheet).toBeVisible({ timeout: 15000 });

    const featuresTab = actorSheet.getByRole("tab", { name: /Features/i });
    if (await featuresTab.isVisible()) {
      await featuresTab.click();
    }

    const itemData = await page.evaluate(
      async ({ packId, projectName }) => {
        const pack = (game as any).packs.get(packId);
        const index = await pack.getIndex();
        const entry = index.find((e) => e.name === projectName);
        if (!entry) throw new Error(`Project ${projectName} not found in ${packId}`);
        return {
          type: "Item",
          uuid: `Compendium.${packId}.Item.${entry._id}`,
        };
      },
      { packId, projectName },
    );

    await simulateFoundryDrop(
      page,
      `:is(.window-app, .sheet.actor, .tidy5e-sheet, foundry-app):has-text("${actorName}")`,
      itemData,
    );

    const projectRow = actorSheet
      .locator(".project-row, .item-row, .item-table-row")
      .filter({ hasText: projectName })
      .first();

    await projectRow.scrollIntoViewIfNeeded();
    await expect(projectRow).toBeVisible({ timeout: 20000 });

    await page.evaluate(() => {
      const groupActor = (game as any).actors.find(
        (a: any) => a.name === "Test Group" && a.type === "group",
      );
      return groupActor.sheet.render(true);
    });

    const groupSheet = page
      .locator(".window-app, .sheet.actor, .tidy5e-sheet, foundry-app, .application")
      .filter({ hasText: "Test Group" })
      .first();
    await expect(groupSheet).toBeVisible({ timeout: 15000 });

    const groupLearningTab = groupSheet.getByRole("tab", { name: /Group Learning/i });
    await groupLearningTab.click();

    const distributeBtn = groupSheet.getByRole("button", { name: /Distribute Time/i });
    await expect(distributeBtn).toBeVisible({ timeout: 15000 });
    await distributeBtn.click();

    const grantDialog = page
      .locator(".thefehrs-learning-manager-dialog, .instructor-selection, .dialog")
      .filter({ hasText: "Modify Training Time" })
      .first();
    await expect(grantDialog).toBeVisible({ timeout: 15000 });

    const hourInputRow = grantDialog.locator(".form-group", { hasText: /Hours/i });
    const hourInput = hourInputRow.locator('input[type="number"]');
    await hourInput.fill("8");

    const recipientRow = grantDialog.locator(".recipient-row", { hasText: actorName });
    const recipientCheckbox = recipientRow.locator('input[type="checkbox"]');
    if (!(await recipientCheckbox.isChecked())) {
      await recipientCheckbox.check();
    }

    const applyBtn = grantDialog.getByRole("button", { name: "Apply Time" });
    await applyBtn.click();
    await expect(grantDialog).toBeHidden({ timeout: 10000 });

    await page.evaluate(async (moduleId) => {
      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      await ProjectEngine.handleAutoTrainSignal();
    }, moduleId);

    await expect(projectRow).not.toContainText("0/100", { timeout: 30000 });
  });
});
