import {
  test,
  expect,
  useBaseWorld,
  disableTour,
  simulateFoundryDrop,
} from "@thefehr/foundry-playwright";
import { waitForGameReady, snapshot, ensureEditMode } from "./utils";

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

  // Every other e2e path that earns progress goes through a different route
  // than this one: the happy-path test above uses the Group Learning
  // "Distribute Time" dialog + handleAutoTrainSignal, and
  // full-project-lifecycle.spec.ts calls ProjectEngine.updateItemWithProgress/
  // completeProject directly. Neither touches PartyTabLogic.updateProgress or
  // the .update-project-progress control itself, so a regression there
  // (including its own completion-at-target branch) would go undetected end
  // to end - see issue #131.
  test("GM can manually edit progress via the Party tab, including completion", async ({
    page,
    deprecationTracker,
  }) => {
    deprecationTracker.registerIgnore("Deprecated since Version DnD5e");

    const actorSheetId = await page.evaluate(async (name) => {
      const actor = (game as any).actors.getName(name);
      await actor.sheet.render(true);
      return actor.sheet.id;
    }, actorName);

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

    // Same selector/retry pattern as the happy-path test above - see its
    // comments for why both the visibility filter and the re-click loop are
    // load-bearing, not defensive styling.
    const projectRow = actorSheet
      .locator(".project-row, .item-row, .item-table-row, [data-tidy-sheet-part='item-table-row']")
      .filter({ hasText: projectName })
      .filter({ visible: true })
      .first();

    await expect(async () => {
      if (await featuresTab.isVisible()) {
        await featuresTab.click();
      }
      await expect(projectRow).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30000, intervals: [500, 1000, 2000] });
    await expect(projectRow).toContainText("0/100");

    // --- Open the group sheet's Party tab (the "Group Learning" tab) and unlock manual edit mode ---
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

    await ensureEditMode(groupSheet);

    // The member's project row lives in a dedicated per-actor table section
    // in the main content area (data-tidy-section-key="actor-<id>"), not in
    // the sidebar's .actor-container list (that's just the avatar/name/bank
    // summary) - filtering by the actor's own name on the wrapping .tidy-table
    // section reaches the right one without needing the actor's raw id.
    const memberSection = groupSheet.locator(".tidy-table", { hasText: actorName });
    const memberProjectRow = memberSection.locator(".project-row", { hasText: projectName });
    const progressInput = memberProjectRow.locator(".update-project-progress");
    await expect(progressInput).toBeVisible({ timeout: 10000 });

    // --- Below target: PartyTabLogic.updateProgress's "silent" branch (no item re-render) ---
    // Set the value directly rather than via a real click+type, matching
    // settings.spec.ts's established pattern for native onchange-bound
    // inputs elsewhere in this repo's e2e suite - Playwright's own .fill()
    // does not reliably fire a plain "change" event on every browser/input
    // combination the way a real user's blur does.
    await progressInput.evaluate((el: HTMLInputElement) => {
      el.value = "42";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(async () => {
      const progress = await page.evaluate(
        async ({ actorName, projectName, moduleId }) => {
          const actor = (game as any).actors.getName(actorName);
          const item = actor.items.find((i: any) => i.name.includes(projectName));
          return item?.getFlag(moduleId, "projectData")?.progress;
        },
        { actorName, projectName, moduleId },
      );
      expect(progress).toBe(42);
    }).toPass({ timeout: 15000 });

    // The silent branch deliberately does not re-render the item/sheet (to
    // avoid flicker/scroll loss - see PartyTabLogic.updateProgress), so the
    // row's own optimistic local state is the only UI signal available here.
    await expect(memberProjectRow).toContainText("42");

    // --- At target: PartyTabLogic.updateProgress's completion branch ---
    // A document update on the member's item can trigger a full re-render of
    // the group sheet independently of the "silent"/render flag above (that
    // flag governs the item's own chat card, not this sheet) - confirmed
    // live: the previous update above left the row/input in place, but by
    // the time this step runs isEditMode has been reset back to locked,
    // replacing the input with the read-only span. Re-establish edit mode
    // and re-locate the input fresh rather than assuming the reference from
    // before the first update still resolves to a live element.
    await expect(async () => {
      await ensureEditMode(groupSheet);
      await expect(progressInput).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000, intervals: [500, 1000, 2000] });

    await progressInput.evaluate((el: HTMLInputElement) => {
      el.value = "100";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(async () => {
      const state = await page.evaluate(
        async ({ actorName, projectName, moduleId }) => {
          const actor = (game as any).actors.getName(actorName);
          const item = actor.items.find((i: any) => i.name === projectName);
          return {
            found: !!item,
            isLearningProject: item?.getFlag(moduleId, "isLearningProject"),
            isLearnedReward: item?.getFlag(moduleId, "isLearnedReward"),
          };
        },
        { actorName, projectName, moduleId },
      );
      expect(state.found).toBe(true);
      expect(state.isLearningProject).toBe(false);
      expect(state.isLearnedReward).toBe(true);
    }).toPass({ timeout: 20000 });

    // Completion sets isCompleted on the project data, and the Party tab
    // filters completed projects out of each member's list entirely (see
    // src/apps/party-tab.ts) - the row should disappear once the sheet
    // re-renders for the completion-triggered item update.
    await expect(memberProjectRow).toBeHidden({ timeout: 15000 });
  });
});
