import { test, expect } from "./fixtures";

test.describe("Multi-User Interactions", () => {
  test("Cross-user signal and auto-spend", async ({ page, browser }) => {
    test.setTimeout(180000);
    const moduleId = "thefehrs-learning-manager";

    // 1. Setup GM Page
    console.log("Setting up GM Page...");
    await page.goto("/join"); // Go to join explicitly to ensure we can log in
    await page.waitForLoadState("networkidle");
    console.log(`GM Page URL: ${page.url()}`);

    if (page.url().includes("/join")) {
      console.log("GM logging in...");
      await page.locator('select[name="userid"]').selectOption({ label: "Gamemaster" });
      await page.locator('button[name="join"]').click();
    } else if (page.url().includes("/game")) {
      console.log("GM already at /game");
    }

    console.log("Waiting for GM game instance to be ready...");
    await page.waitForFunction(
      () => typeof (game as any) !== "undefined" && (game as any).ready && (game as any).user?.isGM,
      { timeout: 60000 },
    );
    console.log("GM Page ready.");

    const gmPage = page;

    // 2. Setup Player Page
    console.log("Setting up Player Page...");
    const playerContext = await browser.newContext(); // Fresh context
    const playerPage = await playerContext.newPage();
    await playerPage.goto("/join");
    await playerPage.waitForLoadState("networkidle");
    console.log(`Player Page URL: ${playerPage.url()}`);

    if (playerPage.url().includes("/join")) {
      console.log("Player logging in...");
      await playerPage.locator('select[name="userid"]').selectOption({ label: "Test Player" });
      await playerPage.locator('input[name="password"]').fill("password");
      await playerPage.locator('button[name="join"]').click();
    }

    console.log("Waiting for Player game instance to be ready...");
    await playerPage.waitForFunction(
      () =>
        typeof (game as any) !== "undefined" && (game as any).ready && !(game as any).user?.isGM,
      { timeout: 60000 },
    );
    console.log("Player Page ready.");

    // 3. Configure Player: Assign PC 3 as character and enable auto-spend
    console.log("Configuring Player character and settings...");
    await playerPage.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      const user = (game as any).user;
      await user.update({ character: actor.id });

      // Enable auto-spend (User-scoped settings)
      await (game as any).settings.set(moduleId, "autoSpend", true);
      await (game as any).settings.set(moduleId, "autoSpendUnits", [
        "hour",
        "day",
        "week",
        "workweek",
      ]);
    }, moduleId);

    // 4. Configure World Settings via GM
    console.log("Configuring world settings via GM...");
    await gmPage.evaluate(async (moduleId) => {
      // Set DC to 1 and method to direct (World-scoped settings)
      const rules = (game as any).settings.get(moduleId, "rules");
      await (game as any).settings.set(moduleId, "rules", {
        ...rules,
        checkDC: 1,
        bulkMethod: "direct",
        nonBulkMethod: "direct",
      });

      const actor = (game as any).actors.getName("PC 3");
      await actor.setFlag(moduleId, "bank", { total: 0 });
      const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
      const projectData = project.getFlag(moduleId, "projectData") || {};
      await project.setFlag(moduleId, "projectData", { ...projectData, progress: 0 });
    }, moduleId);

    // Verify setting is active on Player
    console.log("Verifying settings on Player...");
    await playerPage.waitForFunction(
      (moduleId) => (game as any).settings.get(moduleId, "autoSpend") === true,
      moduleId,
      { timeout: 10000 },
    );

    // 5. GM grants time and signals distribution
    console.log("GM granting time and signaling...");
    await gmPage.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      const currentTotal = actor.getFlag(moduleId, "bank")?.total || 0;
      await actor.setFlag(moduleId, "bank", { total: currentTotal + 8 });

      // Emit the signal
      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      ProjectEngine.signalTimeDistribution();
    }, moduleId);

    // 6. Verify Player page processed it automatically
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
      { timeout: 30000 },
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

    // 7. Verify warning for multiple projects
    console.log("Adding second project to verify warning...");
    await playerPage.evaluate(async (moduleId) => {
      const actor = (game as any).user.character;

      // Add a second project
      const projectData = {
        name: "Second Project",
        type: "feat",
        img: "icons/svg/book.svg",
        flags: {
          [moduleId]: {
            isLearningProject: true,
            projectData: { progress: 0, target: 100 },
          },
        },
      };
      await actor.createEmbeddedDocuments("Item", [projectData]);

      // Grant more time via GM won't work in this context easily,
      // so we just trigger the signal and let the client logic find the projects
    }, moduleId);

    await gmPage.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      const currentTotal = actor.getFlag(moduleId, "bank")?.total || 0;
      await actor.setFlag(moduleId, "bank", { total: currentTotal + 8 });

      // Signal again
      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      ProjectEngine.signalTimeDistribution();
    }, moduleId);

    console.log("Waiting for multiple projects warning...");
    await expect(
      playerPage.locator(".notification.warning").filter({ hasText: /Downtime Engine/i }),
    ).toContainText(/more than one active project/i, { timeout: 15000 });

    // Cleanup and close
    await playerContext.close();
  });
});
