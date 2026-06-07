import {
  test,
  expect,
  useBaseWorld,
  disableTour,
  loginAs,
  waitForReady,
} from "@thefehr/foundry-playwright";
import { waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-multi-user",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

    await page.evaluate(async (moduleId) => {
      const pc3 = await Actor.create({
        name: "PC 3",
        type: "character",
        img: "icons/svg/mystery-man.svg",
        system: { currency: { gp: 100 } },
        flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
      });

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

      const testUser = await User.create({
        name: "Test Player",
        role: 1,
        password: "password",
        character: pc3.id,
      });

      await pc3.update({ ownership: { [testUser.id]: 3 } });

      // @ts-ignore
      await game.modules.get(moduleId).api.ProjectEngine.syncAllProjectActivities();

      const rules = (game as any).settings.get(moduleId, "rules");
      await (game as any).settings.set(moduleId, "rules", {
        ...rules,
        checkDC: 1,
        bulkMethod: "direct",
        nonBulkMethod: "direct",
      });
    }, moduleId);
  },
});

test.describe("Multi-User Interactions", () => {
  test("Cross-user signal and auto-spend", async ({ page, browser, baseURL }) => {
    const gmPage = page;

    const playerContext = await browser.newContext({
      baseURL,
      viewport: { width: 1920, height: 1080 },
    });
    const playerPage = await playerContext.newPage();
    playerPage.on("console", (msg) => console.log("PLAYER CONSOLE:", msg.text()));

    await playerPage.goto("/game");
    await loginAs(playerPage, "Test Player", "password");
    await waitForReady(playerPage);

    await playerPage.evaluate(async (moduleId) => {
      await (game as any).settings.set(moduleId, "autoSpend", true);
      await (game as any).settings.set(moduleId, "autoSpendUnits", [
        "hour",
        "day",
        "week",
        "workweek",
      ]);
    }, moduleId);

    await gmPage.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      await actor.setFlag(moduleId, "bank", { total: 8 });

      const ProjectEngine = (game as any).modules.get(moduleId).api.ProjectEngine;
      ProjectEngine.signalTimeDistribution();
    }, moduleId);

    await playerPage.waitForFunction(
      (moduleId) => {
        const actor = (game as any).actors.getName("PC 3");
        const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
        const progress = project.getFlag(moduleId, "projectData")?.progress || 0;
        const bank = actor.getFlag(moduleId, "bank")?.total || 0;
        return progress > 0 && bank === 0;
      },
      moduleId,
      { timeout: 60000 },
    );

    const stats = await playerPage.evaluate((moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
      return {
        progress: project.getFlag(moduleId, "projectData")?.progress,
        bank: actor.getFlag(moduleId, "bank")?.total,
      };
    }, moduleId);

    expect(stats.progress).toBeGreaterThan(0);
    expect(stats.bank).toBe(0);

    await playerContext.close();
  });
});
