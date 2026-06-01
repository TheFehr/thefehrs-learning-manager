import {
  test,
  expect,
  useFoundry,
  loginAs,
  waitForReady,
  disableTour,
} from "@thefehr/foundry-playwright";

useFoundry(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
});

test.describe("Multi-User Interactions", () => {
  test("Cross-user signal and auto-spend", async ({ page, browser, baseURL }) => {
    const moduleId = "thefehrs-learning-manager";

    // 1. Setup GM Page (handled by useFoundry)
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
    console.log("GM Page ready.");

    // Create Test Player and PC 3 if they don't exist
    await page.evaluate(async (moduleId) => {
      let pc3 = (game as any).actors.getName("PC 3");
      if (pc3) await pc3.delete();

      pc3 = await Actor.create({
        name: "PC 3",
        type: "character",
        img: "icons/svg/mystery-man.svg",
        system: { currency: { gp: 100 } },
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

      // Add a project to PC 3
      const [item] = await pc3.createEmbeddedDocuments("Item", [
        {
          name: "Time Bank Project",
          type: "feat",
          img: "icons/svg/clockwork.svg",
          system: { activities: {}, type: { value: "learning-project" } },
          flags: {
            [moduleId]: {
              isLearningProject: true,
              projectData: { target: 100, progress: 0, categories: [] },
            },
          },
        },
      ]);

      let testUser = (game as any).users.getName("Test Player");
      if (testUser) await testUser.delete();

      testUser = await User.create({
        name: "Test Player",
        role: 1, // PLAYER
        password: "password",
        character: pc3.id,
      });

      // Grant Ownership
      await pc3.update({
        ownership: {
          [testUser.id]: 3, // OWNER
        },
      });

      // Sync activities
      // @ts-ignore
      await game.modules.get(moduleId).api.ProjectEngine.syncAllProjectActivities();

      // Configure World Rules
      const rules = (game as any).settings.get(moduleId, "rules");
      await (game as any).settings.set(moduleId, "rules", {
        ...rules,
        checkDC: 1,
        bulkMethod: "direct",
        nonBulkMethod: "direct",
      });
    }, moduleId);

    const gmPage = page;

    // 2. Setup Player Page
    console.log("Setting up Player Page...");
    const playerContext = await browser.newContext({
      baseURL,
      viewport: { width: 1920, height: 1080 },
    });
    const playerPage = await playerContext.newPage();
    playerPage.on("console", (msg) => console.log("PLAYER CONSOLE:", msg.text()));

    // Login as player
    await playerPage.goto("/game");
    await loginAs(playerPage, "Test Player", "password");
    await disableTour(playerPage);
    await playerPage.evaluate(() => {
      const tourElements = document.querySelectorAll(
        ".tour, .tour-overlay, .tour-center-step, .tour-step-anchor, aside.tour",
      );
      tourElements.forEach((el) => (el as HTMLElement).remove());
      document.body.classList.remove("tour-open");
    });
    await waitForReady(playerPage);
    console.log("Player Page ready.");

    // 3. Configure Player: Enable auto-spend
    console.log("Configuring Player settings...");
    await playerPage.evaluate(async (moduleId) => {
      // Enable auto-spend (User-scoped settings)
      await (game as any).settings.set(moduleId, "autoSpend", true);
      await (game as any).settings.set(moduleId, "autoSpendUnits", [
        "hour",
        "day",
        "week",
        "workweek",
      ]);
      console.log("Player: autoSpend enabled.");
    }, moduleId);

    // 4. GM grants time and signals distribution
    console.log("GM granting time and signaling...");
    await gmPage.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      await actor.setFlag(moduleId, "bank", { total: 8 });
      console.log("GM: Granted 8 hours to PC 3.");

      // Emit the signal
      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      ProjectEngine.signalTimeDistribution();
      console.log("GM: Signal emitted.");
    }, moduleId);

    // 5. Verify Player page processed it automatically
    console.log("Waiting for Player to process auto-spend...");
    await playerPage.waitForFunction(
      (moduleId) => {
        const actor = (game as any).actors.getName("PC 3");
        const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
        const progress = project.getFlag(moduleId, "projectData")?.progress || 0;
        const bank = actor.getFlag(moduleId, "bank")?.total || 0;
        return progress > 0 && bank === 0;
      },
      moduleId,
      { timeout: 60000 }, // Increased timeout
    );

    const stats = await playerPage.evaluate((moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
      return {
        progress: project.getFlag(moduleId, "projectData")?.progress,
        bank: actor.getFlag(moduleId, "bank")?.total,
      };
    }, moduleId);

    console.log(`Cross-user auto-spend check: Progress=${stats.progress}, Bank=${stats.bank}`);
    expect(stats.progress).toBeGreaterThan(0);
    expect(stats.bank).toBe(0);

    // Cleanup and close
    await playerContext.close();
  });
});
