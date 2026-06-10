import { test, expect, useBaseWorld, disableTour } from "@thefehr/foundry-playwright";
import { waitForGameReady, forceClick } from "./utils";

const moduleId = "thefehrs-learning-manager";

useBaseWorld(test, {
  worldId: "test-world",
  systemId: "dnd5e",
  moduleId: ["thefehrs-learning-manager", "tidy5e-sheet"],
  adminPassword: "admin",
  backupName: "fp-base-mass-edit",
  setupWorld: async ({ page }) => {
    await waitForGameReady(page);
    await disableTour(page);

    await page.evaluate(async (mid) => {
      // Create compendiums for each type
      const packs = [
        { name: "me-test-projects", label: "ME Test Projects", type: "Item" },
        { name: "me-test-teachers", label: "ME Test Teachers", type: "Actor" },
        { name: "me-test-books", label: "ME Test Books", type: "Item" },
      ];

      for (const p of packs) {
        const packId = `world.${p.name}`;
        const existing = (game as any).packs.get(packId);
        if (existing) await (existing as any).deleteCompendium();

        await foundry.documents.collections.CompendiumCollection.createCompendium({
          type: p.type,
          label: p.label,
          name: p.name,
          package: "world",
        });
      }

      // Create a configured project item in the projects compendium
      const projectsPack = (game as any).packs.get("world.me-test-projects");
      if (projectsPack && projectsPack.locked) await projectsPack.configure({ locked: false });
      const projectItem = await Item.create(
        { name: "ME Test Project", type: "feat" },
        { pack: "world.me-test-projects" },
      );
      await (projectItem as any).update({
        [`flags.${mid}.learningModeEnabled`]: true,
        [`flags.${mid}.projectData`]: {
          target: 20,
          categories: ["arcana"],
          requirements: [],
          followUpProjectId: "",
        },
      });

      // Create a configured teacher actor in the teachers compendium
      const teachersPack = (game as any).packs.get("world.me-test-teachers");
      if (teachersPack && teachersPack.locked) await teachersPack.configure({ locked: false });
      const teacherActor = await Actor.create(
        { name: "ME Test Teacher", type: "npc" },
        { pack: "world.me-test-teachers" },
      );
      await (teacherActor as any).update({
        [`flags.${mid}.learningModeEnabled`]: true,
        [`flags.${mid}.teacherOfferings`]: [
          { name: "Private Lesson", modifier: 3, costs: {}, categories: [] },
        ],
      });

      // Create a configured book item in the books compendium
      const booksPack = (game as any).packs.get("world.me-test-books");
      if (booksPack && booksPack.locked) await booksPack.configure({ locked: false });
      const bookItem = await Item.create(
        { name: "ME Test Book", type: "loot" },
        { pack: "world.me-test-books" },
      );
      await (bookItem as any).update({
        [`flags.${mid}.learningModeEnabled`]: true,
        [`flags.${mid}.learningBookBonus`]: { modifier: 2, categories: ["history"] },
      });

      // Configure module settings to use these compendiums
      await (game as any).settings.set(mid, "allowedCompendiums", ["world.me-test-projects"]);
      await (game as any).settings.set(mid, "teacherCompendiums", ["world.me-test-teachers"]);
      await (game as any).settings.set(mid, "bookCompendiums", ["world.me-test-books"]);
    }, moduleId);
  },
});

test.describe("Mass Edit App", () => {
  async function openMassEditApp(page: any) {
    await waitForGameReady(page);
    await disableTour(page);

    const appId = await page.evaluate(async (mid: string) => {
      const menu = (game as any).settings.menus.get(`${mid}.massEditMenu`);
      if (!menu) throw new Error(`massEditMenu not found for ${mid}`);
      const app = new menu.type();
      await app.render(true);
      return app.id;
    }, moduleId);

    const massEditApp = page.locator(`[id="${appId}"], .window-app:has-text("Mass Edit")`).first();
    await expect(massEditApp).toBeVisible({ timeout: 20000 });
    return massEditApp;
  }

  test("opens from module settings and shows three tabs", async ({ page }) => {
    const app = await openMassEditApp(page);

    await expect(app.locator(".tab-btn", { hasText: "Projects" })).toBeVisible();
    await expect(app.locator(".tab-btn", { hasText: "Teachers" })).toBeVisible();
    await expect(app.locator(".tab-btn", { hasText: "Books" })).toBeVisible();
  });

  test("Projects tab loads and shows the configured project", async ({ page }) => {
    const app = await openMassEditApp(page);

    // Projects is the default tab
    await expect(app.locator(".projects-tab")).toBeVisible({ timeout: 5000 });

    // Wait for loading to finish
    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });

    await expect(app.locator(".entity-card", { hasText: "ME Test Project" })).toBeVisible({
      timeout: 10000,
    });
  });

  test("Projects tab card expands to show editing UI", async ({ page }) => {
    const app = await openMassEditApp(page);

    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });

    const card = app.locator(".entity-card", { hasText: "ME Test Project" });
    await forceClick(card.locator(".card-header"));

    await expect(card.locator(".card-body")).toBeVisible({ timeout: 5000 });
    await expect(card.locator(".thefehrs-item-learning-config")).toBeVisible({ timeout: 5000 });
    await expect(card.locator(".follow-up-section")).toBeVisible();
  });

  test("Projects tab card shows correct target badge", async ({ page }) => {
    const app = await openMassEditApp(page);

    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });

    const card = app.locator(".entity-card", { hasText: "ME Test Project" });
    await expect(card.locator(".badge", { hasText: "20" })).toBeVisible();
  });

  test("Teachers tab shows the configured teacher", async ({ page }) => {
    const app = await openMassEditApp(page);

    await forceClick(app.locator(".tab-btn", { hasText: "Teachers" }));
    await expect(app.locator(".teachers-tab")).toBeVisible({ timeout: 5000 });

    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });

    await expect(app.locator(".entity-card", { hasText: "ME Test Teacher" })).toBeVisible({
      timeout: 10000,
    });
  });

  test("Teachers tab card expands to show ActorTutelageConfig", async ({ page }) => {
    const app = await openMassEditApp(page);

    await forceClick(app.locator(".tab-btn", { hasText: "Teachers" }));
    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });

    const card = app.locator(".entity-card", { hasText: "ME Test Teacher" });
    await forceClick(card.locator(".card-header"));

    await expect(card.locator(".card-body")).toBeVisible({ timeout: 5000 });
    await expect(card.locator(".thefehrs-actor-tutelage-config")).toBeVisible({ timeout: 5000 });
  });

  test("Teachers tab shows offering count badge", async ({ page }) => {
    const app = await openMassEditApp(page);

    await forceClick(app.locator(".tab-btn", { hasText: "Teachers" }));
    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });

    const card = app.locator(".entity-card", { hasText: "ME Test Teacher" });
    await expect(card.locator(".badge", { hasText: "1" })).toBeVisible();
  });

  test("Books tab shows the configured book", async ({ page }) => {
    const app = await openMassEditApp(page);

    await forceClick(app.locator(".tab-btn", { hasText: "Books" }));
    await expect(app.locator(".books-tab")).toBeVisible({ timeout: 5000 });

    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });

    await expect(app.locator(".entity-card", { hasText: "ME Test Book" })).toBeVisible({
      timeout: 10000,
    });
  });

  test("Books tab card expands to show ItemLearningConfig (book section)", async ({ page }) => {
    const app = await openMassEditApp(page);

    await forceClick(app.locator(".tab-btn", { hasText: "Books" }));
    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });

    const card = app.locator(".entity-card", { hasText: "ME Test Book" });
    await forceClick(card.locator(".card-header"));

    await expect(card.locator(".card-body")).toBeVisible({ timeout: 5000 });
    await expect(card.locator(".thefehrs-item-learning-config")).toBeVisible({ timeout: 5000 });
    // Book section should be visible, not project config
    await expect(card.locator("h4", { hasText: "Learning Book Configuration" })).toBeVisible();
  });

  test("Books tab shows modifier badge", async ({ page }) => {
    const app = await openMassEditApp(page);

    await forceClick(app.locator(".tab-btn", { hasText: "Books" }));
    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });

    const card = app.locator(".entity-card", { hasText: "ME Test Book" });
    await expect(card.locator(".badge", { hasText: "+2" })).toBeVisible();
  });

  test("Add / Create dialog opens in all three tabs", async ({ page }) => {
    const app = await openMassEditApp(page);

    // Projects tab
    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });
    await forceClick(app.locator("button", { hasText: "Add / Create Project" }));
    await expect(app.locator(".add-entity-dialog")).toBeVisible({ timeout: 5000 });
    await forceClick(app.locator(".dismiss-btn"));
    await expect(app.locator(".add-entity-dialog")).toBeHidden({ timeout: 3000 });

    // Teachers tab
    await forceClick(app.locator(".tab-btn", { hasText: "Teachers" }));
    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });
    await forceClick(app.locator("button", { hasText: "Add / Create Teacher" }));
    await expect(app.locator(".add-entity-dialog")).toBeVisible({ timeout: 5000 });
    await forceClick(app.locator(".dismiss-btn"));
    await expect(app.locator(".add-entity-dialog")).toBeHidden({ timeout: 3000 });

    // Books tab
    await forceClick(app.locator(".tab-btn", { hasText: "Books" }));
    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });
    await forceClick(app.locator("button", { hasText: "Add / Create Book" }));
    await expect(app.locator(".add-entity-dialog")).toBeVisible({ timeout: 5000 });
    await forceClick(app.locator(".dismiss-btn"));
    await expect(app.locator(".add-entity-dialog")).toBeHidden({ timeout: 3000 });
  });

  test("creating a new teacher in the world activates and appears in the list", async ({
    page,
  }) => {
    const app = await openMassEditApp(page);

    await forceClick(app.locator(".tab-btn", { hasText: "Teachers" }));
    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 15000 });

    const initialCount = await app.locator(".entity-card").count();

    await forceClick(app.locator("button", { hasText: "Add / Create Teacher" }));
    await expect(app.locator(".add-entity-dialog")).toBeVisible();

    // Switch to Create mode
    await forceClick(app.locator("button", { hasText: "Create New" }));
    await app.locator("input#new-name").fill("Newly Created Teacher");

    // Select World destination
    await app.locator("select#new-destination").evaluate((el: HTMLSelectElement) => {
      const worldOption = Array.from(el.options).find((o) => o.text === "World");
      if (worldOption) el.value = worldOption.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await forceClick(app.locator(".create-mode button", { hasText: "Create" }));

    await expect(async () => {
      const newCount = await app.locator(".entity-card").count();
      expect(newCount).toBeGreaterThan(initialCount);
    }).toPass({ timeout: 15000 });

    await expect(app.locator(".entity-card", { hasText: "Newly Created Teacher" })).toBeVisible();
  });

  test("follow-up project dropdown in Projects tab updates the project flag", async ({ page }) => {
    // Create a second project to use as a follow-up target
    await page.evaluate(async (mid) => {
      const pack = (game as any).packs.get("world.me-test-projects");
      if (pack && pack.locked) await pack.configure({ locked: false });
      const followUpItem = await Item.create(
        { name: "ME Follow-Up Project", type: "feat" },
        { pack: "world.me-test-projects" },
      );
      await (followUpItem as any).update({
        [`flags.${mid}.learningModeEnabled`]: true,
        [`flags.${mid}.projectData`]: {
          target: 10,
          categories: [],
          requirements: [],
          followUpProjectId: "",
        },
      });
    }, moduleId);

    const app = await openMassEditApp(page);

    await expect(app.locator(".loading-state")).toBeHidden({ timeout: 20000 });

    // Expand the first project card
    const card = app.locator(".entity-card", { hasText: "ME Test Project" });
    await forceClick(card.locator(".card-header"));
    await expect(card.locator(".follow-up-section")).toBeVisible({ timeout: 5000 });

    const select = card.locator(".follow-up-section select");
    await expect(select).toBeVisible();

    // Select the follow-up project
    const followUpUuid = await page.evaluate(async (mid) => {
      const pack = (game as any).packs.get("world.me-test-projects");
      const index = await pack.getIndex();
      const entry = index.find((e: any) => e.name === "ME Follow-Up Project");
      return entry ? `Compendium.world.me-test-projects.Item.${entry._id}` : null;
    }, moduleId);

    expect(followUpUuid).toBeTruthy();

    await select.evaluate((el: HTMLSelectElement, uuid: string) => {
      el.value = uuid;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, followUpUuid);

    // Verify flag was saved on the document
    await expect(async () => {
      const savedUuid = await page.evaluate(async (mid) => {
        const pack = (game as any).packs.get("world.me-test-projects");
        const index = await pack.getIndex();
        const entry = index.find((e: any) => e.name === "ME Test Project");
        if (!entry) return null;
        const doc = await pack.getDocument(entry._id);
        return doc.getFlag(mid, "projectData")?.followUpProjectId || null;
      }, moduleId);
      expect(savedUuid).toBe(followUpUuid);
    }).toPass({ timeout: 10000 });
  });
});
