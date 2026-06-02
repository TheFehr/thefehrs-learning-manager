import {
  test,
  expect,
  useFoundry,
  waitForReady,
  loginAs,
  disableTour,
} from "@thefehr/foundry-playwright";

useFoundry(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  deleteIfExists: true,
});

test.describe("Project Requirements", () => {
  test("verify requirement enforcement during project initiation", async ({ page }) => {
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

    // 1. Setup: Create a learnable item with a requirement and an actor
    const setupData = await page.evaluate(async (moduleId) => {
      // Create a Pack for the item
      const packName = "test-requirements";
      const packId = `world.${packName}`;
      let pack = (game as any).packs.get(packId);
      if (pack) await pack.deleteCompendium();

      // @ts-ignore
      await foundry.documents.collections.CompendiumCollection.createCompendium({
        label: "Test Requirements",
        name: packName,
        type: "Item",
      });
      pack = (game as any).packs.get(packId);

      // Create a Feat with a requirement
      const item = await Item.create(
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

      // Create an Actor with low strength
      const actor = await Actor.create({
        name: "Weak Actor",
        type: "character",
        system: {
          abilities: {
            str: { value: 10 },
          },
        },
      });

      // Allow the compendium
      const allowed = (game as any).settings.get(moduleId, "allowedCompendiums") || [];
      if (!allowed.includes(packId)) {
        await (game as any).settings.set(moduleId, "allowedCompendiums", [...allowed, packId]);
      }

      return {
        actorId: actor.id,
        itemUuid: item.uuid,
        packId: packId,
      };
    }, moduleId);

    // 2. Test 1: Attempt to drop item onto actor (Should Fail)
    await page.evaluate(
      async ({ actorId, itemUuid }) => {
        const actor = (game as any).actors.get(actorId);
        // @ts-ignore
        Hooks.call("dropActorSheetData", actor, null, {
          type: "Item",
          uuid: itemUuid,
        });
      },
      { actorId: setupData.actorId, itemUuid: setupData.itemUuid },
    );

    // Verify warning notification
    const notification = page
      .locator("#notifications .notification, .notification.warn, .notification.warning")
      .filter({ hasText: "Requirements not met" })
      .first();
    await expect(notification).toBeVisible({ timeout: 15000 });
    await expect(notification).toContainText("system.abilities.str.value (10) >= 13");

    // Verify item was NOT added to actor
    const hasItem = await page.evaluate(
      ({ actorId }) => {
        const actor = (game as any).actors.get(actorId);
        return actor.items.some((i: any) => i.name.includes("High Strength Feat"));
      },
      { actorId: setupData.actorId },
    );
    expect(hasItem).toBe(false);

    // 3. Test 2: Increase actor strength and try again (Should Pass)
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
        // @ts-ignore
        Hooks.call("dropActorSheetData", actor, null, {
          type: "Item",
          uuid: itemUuid,
        });
      },
      { actorId: setupData.actorId, itemUuid: setupData.itemUuid },
    );

    // Verify item WAS added to actor
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
