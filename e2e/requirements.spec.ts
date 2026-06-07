import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { waitForGameReady } from "./utils";

const moduleId = "thefehrs-learning-manager";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-requirements",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

    await page.evaluate(async (moduleId) => {
      const packName = "test-requirements";
      const packId = `world.${packName}`;
      let pack = (game as any).packs.get(packId);
      if (pack) await pack.deleteCompendium();

      await foundry.documents.collections.CompendiumCollection.createCompendium({
        label: "Test Requirements",
        name: packName,
        type: "Item",
      });

      await Item.create(
        {
          name: "High Strength Feat",
          type: "feat",
          flags: {
            [moduleId]: {
              isLearningProject: true,
              projectData: {
                target: 10,
                requirements: [
                  {
                    id: "req1",
                    attribute: "system.abilities.str.value",
                    operator: ">=",
                    value: "13",
                  },
                ],
              },
            },
          },
        },
        { pack: packId },
      );

      await Actor.create({
        name: "Weak Actor",
        type: "character",
        system: { abilities: { str: { value: 10 } } },
      });

      const allowed = (game as any).settings.get(moduleId, "allowedCompendiums") || [];
      if (!allowed.includes(packId)) {
        await (game as any).settings.set(moduleId, "allowedCompendiums", [...allowed, packId]);
      }
    }, moduleId);
  },
});

test.describe("Project Requirements", () => {
  test("verify requirement enforcement during project initiation", async ({ page }) => {
    const setupData = await page.evaluate(async (moduleId) => {
      const packId = "world.test-requirements";
      const pack = (game as any).packs.get(packId);
      const index = await pack.getIndex();
      const entry = index.getName("High Strength Feat");
      const item = await pack.getDocument(entry._id);

      const actor = (game as any).actors.getName("Weak Actor");
      return {
        actorId: actor.id,
        itemUuid: item.uuid,
      };
    }, moduleId);

    // Test 1: Drop onto actor with insufficient strength (should fail)
    await page.evaluate(
      async ({ actorId, itemUuid }) => {
        const actor = (game as any).actors.get(actorId);
        Hooks.call("dropActorSheetData", actor, null, { type: "Item", uuid: itemUuid });
      },
      { actorId: setupData.actorId, itemUuid: setupData.itemUuid },
    );

    const notification = page
      .locator("#notifications .notification, .notification.warn, .notification.warning")
      .filter({ hasText: "Requirements not met" })
      .first();
    await expect(notification).toBeVisible({ timeout: 15000 });
    await expect(notification).toContainText("system.abilities.str.value (10) >= 13");

    const hasItem = await page.evaluate(
      ({ actorId }) => {
        const actor = (game as any).actors.get(actorId);
        return actor.items.some((i: any) => i.name.includes("High Strength Feat"));
      },
      { actorId: setupData.actorId },
    );
    expect(hasItem).toBe(false);

    // Test 2: Increase strength and retry (should succeed)
    await page.evaluate(
      async ({ actorId }) => {
        const actor = (game as any).actors.get(actorId);
        await actor.update({ "system.abilities.str.value": 15 });
      },
      { actorId: setupData.actorId },
    );

    await page.evaluate(
      async ({ actorId, itemUuid }) => {
        const actor = (game as any).actors.get(actorId);
        Hooks.call("dropActorSheetData", actor, null, { type: "Item", uuid: itemUuid });
      },
      { actorId: setupData.actorId, itemUuid: setupData.itemUuid },
    );

    await page.waitForFunction(
      ({ actorId }) => {
        const actor = (game as any).actors.get(actorId);
        return actor.items.some((i: any) => i.name.includes("High Strength Feat"));
      },
      { actorId: setupData.actorId },
      { timeout: 10000 },
    );

    const finalCheck = await page.evaluate(
      ({ actorId, moduleId }) => {
        const actor = (game as any).actors.get(actorId);
        const item = actor.items.find((i: any) => i.name.includes("High Strength Feat"));
        return !!item && item.getFlag(moduleId, "isLearningProject");
      },
      { actorId: setupData.actorId, moduleId },
    );
    expect(finalCheck).toBe(true);
  });
});
