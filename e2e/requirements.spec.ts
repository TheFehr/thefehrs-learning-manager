import { test, expect } from "./fixtures";

test.describe("Project Requirements", () => {
  let setupData: any;

  test.afterEach(async ({ page }) => {
    if (setupData) {
      await page.evaluate(async (data) => {
        const moduleId = "thefehrs-learning-manager";
        // Restore settings
        await (game as any).settings.set(moduleId, "allowedCompendiums", data.originalAllowed);

        // Delete world documents
        const pack = (game as any).packs.get(data.packId);
        if (pack) await pack.delete();

        const actor = (game as any).actors.get(data.actorId);
        if (actor) await actor.delete();
      }, setupData);
    }
  });

  test("verify requirement enforcement during project initiation", async ({ page }) => {
    test.setTimeout(240000);
    await page.goto("/game");

    await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
      timeout: 60000,
    });

    const moduleId = "thefehrs-learning-manager";

    // 1. Setup: Create a learnable item with a requirement and an actor
    setupData = await page.evaluate(async (moduleId) => {
      // Create a Pack for the item
      const packName = "test-requirements";
      const pack = (game as any).packs.get(`world.${packName}`);
      if (pack) await pack.delete();

      // Use the correct namespaced CompendiumCollection if available, fallback to global
      const collection =
        (foundry as any).documents?.collections?.CompendiumCollection ||
        (window as any).CompendiumCollection;
      await collection.createCompendium({
        label: "Test Requirements",
        name: packName,
        type: "Item",
      });

      // Create a Feat with a requirement
      const item = await Item.create(
        {
          name: "High Strength Feat",
          type: "feat",
          flags: {
            [moduleId]: {
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
        { pack: `world.${packName}` },
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
      const originalValue = [...allowed];
      if (!allowed.includes(`world.${packName}`)) {
        await (game as any).settings.set(moduleId, "allowedCompendiums", [
          ...allowed,
          `world.${packName}`,
        ]);
      }

      return {
        actorId: actor.id,
        itemUuid: item.uuid,
        packId: `world.${packName}`,
        originalAllowed: originalValue,
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

    // Click to dismiss if possible, or just wait
    try {
      await notification.click({ timeout: 2000 });
    } catch (e) {}

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
      ({ actorId }) => {
        const actor = (game as any).actors.get(actorId);
        const item = actor.items.find((i: any) => i.name.includes("High Strength Feat"));
        return !!item && item.getFlag("thefehrs-learning-manager", "isLearningProject");
      },
      { actorId: setupData.actorId },
    );
    expect(finalCheck).toBe(true);
  });
});
