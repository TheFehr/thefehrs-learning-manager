import {
  test,
  expect,
  useBaseWorld,
  disableTour,
  simulateFoundryDrop,
} from "@thefehr/foundry-playwright";
import { waitForGameReady, snapshot } from "./utils";

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

        await foundry.documents.collections.CompendiumCollection.createCompendium({
          type: "Item",
          label: "Test Learning Feats",
          name: "test-learning-feats",
          package: "world",
        });
        pack = (game as any).packs.get(packId);

        // A real GM-configured source item (via ItemLearningConfig) only ever
        // has learningModeEnabled + projectData - isLearningProject only gets
        // set on the *converted copy* that lands on an actor after a real
        // grant (ProjectLifecycle.initiateProjectFromItem). Setting it here
        // on the source previously masked allowedCompendiums never being
        // registered below: the drop hook's compendium check failed, so
        // Foundry fell back to a plain item copy - which then still carried
        // isLearningProject/projectData through unmodified, since a plain
        // copy preserves flags, making the drop look like it had actually
        // triggered a real conversion when it never did.
        await Item.create(
          {
            name: projectName,
            type: "feat",
            // No explicit img: that specific icon 404s under this Foundry
            // version's bundled icon set (confirmed live - showed up as a
            // broken image in the actor-sheet screenshots), and there's no
            // portrait this test actually cares about. Omitting it falls
            // back to the system's own guaranteed-valid default icon for a
            // feat item, same as how a project created via the real Mass
            // Edit UI (full-project-lifecycle.spec.ts) gets one.
            system: {
              description: { value: "A test feat for learning." },
              type: { value: "feat" },
              activities: {},
            },
            flags: {
              [moduleId]: {
                learningModeEnabled: true,
                projectData: { target: 100, requirements: [], categories: [] },
              },
            },
          },
          { pack: packId },
        );

        // tidy5e-sheet's Classic character sheet doesn't apply under Foundry
        // v14 (it silently falls back to dnd5e's own default sheet instead,
        // which uses entirely different markup) - Quadrone is its v14
        // replacement, while v13 still needs Classic.
        const isV14 = (game as any).release.generation >= 14;
        const actor = await Actor.create({
          name: actorName,
          type: "character",
          img: "icons/svg/mystery-man.svg",
          system: { currency: { gp: 100 } },
          flags: {
            core: {
              sheetClass: isV14
                ? "dnd5e.Tidy5eCharacterSheetQuadrone"
                : "dnd5e.Tidy5eCharacterSheet",
            },
          },
        });

        const groupActor = await Actor.create({
          name: "Test Group",
          type: "group",
          flags: { core: { sheetClass: "dnd5e.Tidy5eGroupSheetQuadrone" } },
        });
        // @ts-ignore
        await groupActor.update({ "system.members": [{ actor: actor.id }] });

        await (game as any).user.update({ character: actor.id });
        await (game as any).settings.set(moduleId, "allowedCompendiums", [packId]);
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

    const actorSheetId = await page.evaluate(async (name) => {
      const actor = (game as any).actors.getName(name);
      await actor.sheet.render(true);
      return actor.sheet.id;
    }, actorName);

    // Located by Foundry's own assigned application id, not by text: once
    // the group sheet also opens later in this test, its member list
    // mentions the actor's name too, which made a text-based filter (even
    // scoped to what looked like the window title) ambiguously match either
    // window depending on DOM order.
    const actorSheet = page.locator(`[id="${actorSheetId}"]`);
    await expect(actorSheet).toBeVisible({ timeout: 15000 });

    const featuresTab = actorSheet.getByRole("tab", { name: /Features/i });
    if (await featuresTab.isVisible()) {
      await featuresTab.click();
    }

    const itemData = await page.evaluate(
      async ({ packId, projectName }) => {
        const pack = (game as any).packs.get(packId);
        const index = await pack.getIndex();
        const entry = index.find((e: any) => e.name === projectName);
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

    // Quadrone (v14) renders item rows as .tidy-table-row /
    // [data-tidy-sheet-part="item-table-row"], not the Classic sheet's
    // .item-row/.item-table-row - keep both so this matches whichever sheet
    // is actually active for the running Foundry version.
    //
    // .filter({ visible: true }) is load-bearing, not defensive styling:
    // confirmed live (under host CPU contention) that tidy5e-sheet can leave
    // a second element matching this same selector+text in the DOM - a
    // zero-size (0x0 bounding rect) row that is otherwise
    // display:flex/visibility:visible/opacity:1 by computed style, ahead of
    // the real, properly laid-out row in DOM order. A bare .first() locks
    // onto that zero-size phantom and reports the row as permanently hidden
    // even though the real row is plainly visible on screen the whole time.
    // Likely a leftover from tidy5e's own insert transition, but from this
    // test's side the fix is the same regardless: pick the match that is
    // actually rendered, not whichever comes first in the DOM.
    const projectRow = actorSheet
      .locator(".project-row, .item-row, .item-table-row, [data-tidy-sheet-part='item-table-row']")
      .filter({ hasText: projectName })
      .filter({ visible: true })
      .first();

    // The drop re-renders the sheet, which can reset the active tab back to
    // its default - confirmed live that this can happen more than once, at
    // an unpredictable delay (registering allowedCompendiums above means the
    // drop now actually runs the real initiateProjectFromItem conversion
    // instead of silently falling through to a plain item copy, and that
    // conversion's own createEmbeddedDocuments call can trigger further
    // hook-driven re-renders). A single re-click after a fixed wait isn't
    // reliable against an unknown number of resets at an unknown delay - so
    // keep re-clicking Features and re-checking row visibility together
    // until both hold, rather than assuming one re-click settles it.
    await expect(async () => {
      if (await featuresTab.isVisible()) {
        await featuresTab.click();
      }
      await expect(projectRow).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30000, intervals: [500, 1000, 2000] });
    await projectRow.scrollIntoViewIfNeeded();

    // A plain, un-converted item copy (the failure mode a missing
    // allowedCompendiums registration produces - see the setup comment
    // above) would still satisfy the projectRow locator above, since that
    // only filters by name text. Assert the real conversion actually ran:
    // renamed with a progress suffix, not just present on the sheet.
    await expect(projectRow).toContainText("0/100");
    await snapshot(actorSheet, "actor-sheet-project-new");

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

    // Locator.screenshot() crops the full-page screenshot to the element's
    // bounding box - it does not screenshot "through" occlusion. The group
    // sheet opened above still sits on screen and, being the most recently
    // focused window, paints on top of the actor sheet at these coordinates -
    // confirmed live: without this, the captured image was the group sheet's
    // content, not the actor sheet's, despite actorSheet being the correct
    // locator. Bring it back to front before capturing.
    await page.evaluate((id) => {
      // ApplicationV2's method is bringToFront(), not V1's bringToTop().
      (foundry.applications.instances as Map<string, any>).get(id)?.bringToFront();
    }, actorSheetId);

    // Expand the row so the screenshot actually shows the progress bar:
    // ProjectLifecycle.updateItemWithProgress writes a real progress-bar
    // widget (ProjectUI.generateProgressHtml) into the item's own
    // description, and tidy5e only renders an item's description when its
    // row is expanded - collapsed, the row is just the name/uses/time
    // columns with no progress visible at all.
    await projectRow.locator(".expand-indicator").click();
    await expect(actorSheet.locator(".learning-manager-progress-container")).toBeVisible({
      timeout: 10000,
    });
    await snapshot(actorSheet, "actor-sheet-project-in-progress");
  });
});
