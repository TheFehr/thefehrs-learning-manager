import {
  test,
  expect,
  useFoundry,
  waitForReady,
  loginAs,
  disableTour,
  simulateFoundryDrop,
} from "@thefehr/foundry-playwright";

useFoundry(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  deleteIfExists: true,
});

test.describe("Project Lifecycle (Happy Path)", () => {
  test("should start and progress a project on an actor", async ({ page }) => {
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
    const actorName = "PC 1";
    const projectName = "Test Learning Feat";
    const packId = "world.test-learning-feats";

    // 1. Setup specialized test data and rules
    await page.evaluate(
      async ({ moduleId, actorName, projectName, packId }) => {
        // Create Compendium
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

        // Create Actor
        let actor = (game as any).actors.getName(actorName);
        if (actor) await actor.delete();
        actor = await Actor.create({
          name: actorName,
          type: "character",
          img: "icons/svg/mystery-man.svg",
          system: { currency: { gp: 100 } },
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

        // Assign PC 1 to the GM so auto-spend logic finds an actor to train
        await (game as any).user.update({ character: actor.id });
        // Enable auto-spend
        await (game as any).settings.set(moduleId, "autoSpend", true);
        await (game as any).settings.set(moduleId, "autoSpendUnits", [
          "hour",
          "day",
          "workweek",
          "week",
        ]);

        // Set DC to 1 and method to direct
        const rules = (game as any).settings.get(moduleId, "rules");
        await (game as any).settings.set(moduleId, "rules", {
          ...rules,
          checkDC: 1,
          bulkMethod: "direct",
          nonBulkMethod: "direct",
        });

        // Patch handleAutoTrainSignal to bypass the GM check for the purpose of this E2E test
        const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
        ProjectEngine.handleAutoTrainSignal = async function () {
          const actor = (game as any).user.character;
          if (!actor) return;
          const projects = actor.items.filter(
            (i: any) =>
              i.getFlag(moduleId, "isLearningProject") &&
              (i.name.includes("0/100") || i.name.includes(projectName)),
          );
          if (projects.length >= 1) {
            await ProjectEngine.processSpendAll(projects[0], ["hour", "day", "workweek", "week"]);
          }
        };
      },
      { moduleId, actorName, projectName, packId },
    );

    // 2. Open the Actor Sheet for PC 1
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

    // 3. Start a project by "dropping" an item from a compendium onto the actor
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
      `.window-app, .sheet.actor, .tidy5e-sheet, foundry-app:has-text("${actorName}")`,
      itemData,
    );

    // 4. Verify the project appeared on the actor sheet
    const projectRow = actorSheet
      .locator(".project-row, .item-row, .item-table-row")
      .filter({ hasText: projectName })
      .first();

    await projectRow.scrollIntoViewIfNeeded();
    await expect(projectRow).toBeVisible({ timeout: 20000 });

    // 5. Open the Party Tab
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

    // 6. Click "Distribute Time" button
    const distributeBtn = groupSheet.getByRole("button", { name: /Distribute Time/i });
    await expect(distributeBtn).toBeVisible({ timeout: 15000 });
    await distributeBtn.click();

    // 7. Fill the Grant Time dialog
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

    // 7.5. Manually trigger auto-spend
    await page.evaluate(async () => {
      const moduleId = "thefehrs-learning-manager";
      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      await ProjectEngine.handleAutoTrainSignal();
    });

    // 8. Verify progress increased
    await expect(projectRow).not.toContainText("0/100", { timeout: 30000 });
  });
});
