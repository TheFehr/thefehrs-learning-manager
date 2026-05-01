import { test, expect } from "./fixtures";

test.describe("Project Lifecycle (Happy Path)", () => {
  test("should start and progress a project on an actor", async ({ page }) => {
    page.on("console", (msg) => console.log("BROWSER CONSOLE:", msg.text()));
    test.setTimeout(180000);
    await page.goto("/game");

    // 1. Wait for game to be ready
    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    // --- Data Setup Start ---
    await page.evaluate(async () => {
      // Create Compendiums if they don't exist
      const compendiums = [
        { label: "Test Learning Feats", name: "test-learning-feats", type: "Item" },
      ];

      for (const c of compendiums) {
        let pack = (game as any).packs.get(`world.${c.name}`);
        if (!pack) {
          // @ts-ignore
          await foundry.documents.collections.CompendiumCollection.createCompendium({
            type: c.type,
            label: c.label,
            name: c.name,
            package: "world",
          });
        }
      }

      // Create Learning Feat in pack
      const featPack = (game as any).packs.get("world.test-learning-feats");
      const existingFeats = await featPack.getDocuments();
      if (existingFeats.length === 0) {
        const featData = {
          name: "Test Learning Feat",
          type: "feat",
          img: "icons/skills/trades/smithing-anvil-silver.webp",
          system: {
            description: { value: "A test feat for learning." },
            type: { value: "feat" },
            activities: {},
          },
          flags: {
            "thefehrs-learning-manager": {
              isLearningProject: true,
              projectData: {
                target: 100,
                requirements: [],
              },
            },
          },
        };
        // @ts-ignore
        await Item.create(featData, { pack: "world.test-learning-feats" });
      }

      // Create PC Actor
      let actor = (game as any).actors.getName("PC 1");
      if (!actor) {
        const pcData = {
          name: "PC 1",
          type: "character",
          img: "icons/svg/mystery-man.svg",
          system: {
            currency: { gp: 100 },
          },
          flags: {
            core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" },
          },
        };
        // @ts-ignore
        await Actor.create(pcData);
      }

      // Create Group Actor
      let groupActor = (game as any).actors.find(
        (a) => a.name === "Test Group" && a.type === "group",
      );
      if (!groupActor) {
        const groupData = {
          name: "Test Group",
          type: "group",
          img: "icons/svg/group.svg",
          flags: {
            core: { sheetClass: "dnd5e.Tidy5eGroupSheetQuadrone" },
          },
        };
        // @ts-ignore
        groupActor = await Actor.create(groupData);
      }

      // Add PC 1 to group
      const pc1 = (game as any).actors.getName("PC 1");
      if (groupActor && pc1) {
        if (typeof groupActor.system.addMember === "function") {
          await groupActor.system.addMember(pc1);
        } else {
          const memberList = groupActor.system.members || [];
          const memberIds = new Set(memberList.map((m: any) => m.actorId || m.id));
          if (!memberIds.has(pc1.id)) {
            await groupActor.update({
              "system.members": [...memberList, { actorId: pc1.id }],
            });
          }
        }
      }

      // Configure Settings
      const moduleId = "thefehrs-learning-manager";
      await (game as any).settings.set(moduleId, "allowedCompendiums", [
        "world.test-learning-feats",
      ]);
      await (game as any).settings.set(moduleId, "timeUnits", [
        { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
        { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
        { id: "workweek", name: "Work Week", short: "ww", isBulk: true, ratio: 40 },
        { id: "week", name: "Week", short: "w", isBulk: true, ratio: 70 },
      ]);
    });
    // --- Data Setup End ---

    const actorName = "PC 1";
    const projectName = "Test Learning Feat";
    const packId = "world.test-learning-feats";

    // 1.5. Configure auto-spend and assign character to GM for testing
    await page.evaluate(
      async ({ actorName, projectName }) => {
        const moduleId = "thefehrs-learning-manager";
        const actor = (game as any).actors.getName(actorName);
        if (!actor) throw new Error(`Actor ${actorName} not found`);
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

        // Set DC to 1 and method to direct to ensure progress is guaranteed for the test
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
          console.log("handleAutoTrainSignal triggered in E2E");
          const actor = (game as any).user.character;
          if (!actor) {
            console.log("No character assigned to user");
            return;
          }
          // Find the newly created project
          // We look for projects with (0/100) or simply the one we just added
          const projects = actor.items.filter(
            (i: any) =>
              i.getFlag(moduleId, "isLearningProject") &&
              (i.name.includes("0/100") || i.name.includes(projectName)),
          );
          console.log(`Found ${projects.length} matching projects for auto-train`);
          if (projects.length >= 1) {
            console.log(`Processing auto-spend for ${projects[0].name}`);
            await ProjectEngine.processSpendAll(projects[0], ["hour", "day", "workweek", "week"]);
          }
        };
      },
      { actorName, projectName },
    );

    // 1.7. Cleanup any existing project to ensure fresh start
    await page.evaluate(
      async ({ projectName, actorName }) => {
        const actor = (game as any).actors.getName(actorName);
        const items = actor.items.filter((i: any) => i.name.includes(projectName));
        for (const item of items) {
          await item.delete();
        }
      },
      { projectName, actorName },
    );

    // 2. Open the Actor Sheet for PC 1
    await page.evaluate((name) => {
      const actor = (game as any).actors.getName(name);
      return actor.sheet.render(true);
    }, actorName);

    // Use a more specific locator for the window. Tidy5e sheets should have .tidy5e-sheet.
    // We'll use a combination that is likely to match.
    const actorSheet = page
      .locator(".window-app, .tidy5e-sheet, .application")
      .filter({ hasText: actorName })
      .first();
    await expect(actorSheet).toBeVisible({ timeout: 15000 });

    // Switch to Features tab to ensure we can see the project
    const featuresTab = actorSheet.getByRole("tab", { name: /Features/i });
    if (await featuresTab.isVisible()) {
      await featuresTab.click();
    }

    // 3. Start a project by "dropping" an item from a compendium onto the actor
    await page.evaluate(
      async ({ packId, projectName, actorName }) => {
        const pack = (game as any).packs.get(packId);
        const index = await pack.getIndex();
        const entry = index.find((e) => e.name === projectName);
        if (!entry) throw new Error(`Project ${projectName} not found in ${packId}`);

        const actor = (game as any).actors.getName(actorName);
        const data = {
          type: "Item",
          uuid: `Compendium.${packId}.Item.${entry._id}`,
        };

        const sheet = actor.sheet;
        const event = new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer(),
        });
        event.dataTransfer?.setData("text/plain", JSON.stringify(data));

        const target =
          document.querySelector(`.window-app[id="${sheet.id}"] .window-content`) ||
          document.getElementById(sheet.id)?.querySelector(".window-content") ||
          document.querySelector(`.application[id*="${sheet.id}"]`);
        target?.dispatchEvent(event);
      },
      { packId, projectName, actorName },
    );

    // 4. Verify the project appeared on the actor sheet
    // Ensure the section is expanded if it's collapsed (common in Tidy5e)
    const learningHeader = actorSheet.locator(".tidy-table-header-row", {
      hasText: /In-Progress Learning/i,
    });
    if ((await learningHeader.count()) > 0) {
      const isCollapsed = await learningHeader.locator(".fa-chevron-right").isVisible();
      if (isCollapsed) {
        await learningHeader.click();
      }
    }

    const projectRow = actorSheet
      .locator(".project-row, .item-row, .item-table-row")
      .filter({ hasText: projectName })
      .first();

    // Use scrollIntoView to handle potentially off-screen rows in long lists
    await projectRow.scrollIntoViewIfNeeded();
    await expect(projectRow).toBeVisible({ timeout: 20000 });

    // 5. Open the Party Tab to grant time
    await page.evaluate(() => {
      const groupActor = (game as any).actors.find(
        (a) => a.name === "Test Group" && a.type === "group",
      );
      if (!groupActor) throw new Error("Test Group not found");
      return groupActor.sheet.render(true);
    });

    const groupSheet = page
      .locator(".window-app, .tidy5e-sheet, .application")
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
      .locator(".window-app, .application")
      .filter({ hasText: "Modify Training Time" });
    await expect(grantDialog).toBeVisible({ timeout: 15000 });

    // Find the input for "Hour" specifically. Labels are "Hours", "Days", etc.
    const hourInputRow = grantDialog.locator(".form-group", { hasText: /Hours/i });
    const hourInput = hourInputRow.locator('input[type="number"]');
    await hourInput.fill("8");

    // Ensure PC 1 is selected in the recipients list
    const recipientRow = grantDialog.locator(".recipient-row", { hasText: actorName });
    const recipientCheckbox = recipientRow.locator('input[type="checkbox"]');
    if (!(await recipientCheckbox.isChecked())) {
      await recipientCheckbox.check();
    }

    const applyBtn = grantDialog.getByRole("button", { name: "Apply Time" });
    await applyBtn.click();
    await expect(grantDialog).toBeHidden({ timeout: 10000 });

    // 7.2 Verify bank increased before proceeding
    const bankIncreased = await page.evaluate(
      async ({ actorName }) => {
        const actor = (game as any).actors.getName(actorName);
        const bank = actor.getFlag("thefehrs-learning-manager", "bank");
        return (bank?.total || 0) >= 8;
      },
      { actorName },
    );

    if (!bankIncreased) {
      throw new Error("Bank did not increase after applying time in dialog");
    }

    // 7.5. Manually trigger auto-spend
    await page.evaluate(async () => {
      const moduleId = "thefehrs-learning-manager";
      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      console.log("Triggering handleAutoTrainSignal manually");
      await ProjectEngine.handleAutoTrainSignal();
      console.log("handleAutoTrainSignal manual trigger complete");
    });

    // 7.6 Wait for bank to be spent. It should have decreased from 8.
    console.log("Waiting for bank to decrease...");
    await page.waitForFunction(
      ({ actorName }) => {
        const actor = (game as any).actors.getName(actorName);
        const bank = actor.getFlag("thefehrs-learning-manager", "bank");
        const total = bank?.total || 0;
        console.log(`Current bank total: ${total}`);
        return total < 8;
      },
      { actorName },
      { timeout: 30000 },
    );

    // 8. Verify progress increased
    console.log("Checking projectRow for progress update...");
    // We check for the absence of "0/100" which is what's in the name
    await expect(projectRow).not.toContainText("0/100", { timeout: 30000 });

    console.log("Project lifecycle test completed successfully");
  });
});
