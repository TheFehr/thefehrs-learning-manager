import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-time-bank",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);
  },
});

test.describe("Advanced Time Bank Management", () => {
  test("Spend All functionality for PC 3", async ({ page }) => {
    await page.evaluate(async (moduleId) => {
      let actor = (game as any).actors.getName("PC 3");
      if (!actor) {
        actor = await Actor.create({
          name: "PC 3",
          type: "character",
          img: "icons/svg/mystery-man.svg",
          flags: { core: { sheetClass: "dnd5e.Tidy5eCharacterSheet" } },
        });
      }

      const existingProjects = actor.items.filter((i: any) => i.name.includes("Time Bank Project"));
      for (const p of existingProjects) {
        await p.delete();
      }

      const item = await Item.create({
        name: "Time Bank Project",
        type: "feat",
        system: {
          description: { value: "A feat for testing time bank spend-all functionality." },
          type: { value: "feat" },
          activities: {},
        },
        flags: {
          [moduleId]: {
            isLearningProject: true,
            projectData: { target: 100, progress: 0 },
          },
        },
      });

      const api = (game as any).modules.get(moduleId).api;
      const project = await api.ProjectEngine.initiateProjectFromItem(actor, item);
      if (!project) throw new Error("Failed to initiate Time Bank Project on actor");

      await item.delete();

      const rules = (game as any).settings.get(moduleId, "rules");
      await (game as any).settings.set(moduleId, "rules", {
        ...rules,
        checkDC: 1,
        bulkMethod: "direct",
        nonBulkMethod: "direct",
      });

      await actor.setFlag(moduleId, "bank", { total: 100 });
      const projectData = project.getFlag(moduleId, "projectData") || {};
      await project.setFlag(moduleId, "projectData", { ...projectData, progress: 0 });

      await api.ProjectEngine.syncAllProjectActivities();

      actor.sheet.render(true);
    }, moduleId);

    const sheet = page.locator(".window-app, .sheet.actor, foundry-app").first();
    await expect(sheet).toBeVisible({ timeout: 20000 });

    await page.evaluate(async (moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
      const activities = project.system.activities.contents;
      const spendAllActivity = activities.find((a: any) =>
        a.name.toLowerCase().includes("spend all time"),
      );
      if (!spendAllActivity) throw new Error("Spend all time activity not found");
      spendAllActivity.use();
    }, moduleId);

    const dialog = page
      .locator(".thefehrs-learning-manager-dialog, .instructor-selection, .dialog")
      .first();
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(
      dialog.getByText(/Are you sure you want to spend.*all.*available training time/i),
    ).toBeVisible();

    await dialog.getByRole("button", { name: /Yes/i }).click();

    await page.waitForFunction(
      (moduleId) => {
        const actor = (game as any).actors.getName("PC 3");
        const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
        const bankTotal = actor.getFlag(moduleId, "bank")?.total;
        const progress = project.getFlag(moduleId, "projectData")?.progress;
        return bankTotal === 0 && progress > 0;
      },
      moduleId,
      { timeout: 15000 },
    );

    const stats = await page.evaluate((moduleId) => {
      const actor = (game as any).actors.getName("PC 3");
      const project = actor.items.find((i: any) => i.name.includes("Time Bank Project"));
      return {
        bankTotal: actor.getFlag(moduleId, "bank")?.total,
        progress: project.getFlag(moduleId, "projectData")?.progress,
      };
    }, moduleId);

    expect(stats.bankTotal).toBe(0);
    expect(stats.progress).toBeGreaterThan(0);
  });
});
