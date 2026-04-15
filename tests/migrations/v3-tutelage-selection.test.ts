import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV3 } from "../../src/migrations/v3-tutelage-selection";
import { MODULE_ID } from "../../src/global";

describe("v3-tutelage-selection migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const packs: any[] = [];
    (packs as any).get = vi
      .fn()
      .mockImplementation((id: string) =>
        packs.find((p) => p.metadata?.id === id || p.collection === id),
      );
    (packs as any).find = vi.fn().mockImplementation((fn: any) => packs.find(fn));

    (global as any).game = {
      user: { isGM: true },
      settings: {
        get: vi.fn(),
        set: vi.fn().mockResolvedValue(true),
        settings: new Map(),
        register: vi.fn(),
      },
      actors: { contents: [] },
      packs: packs,
      system: { id: "dnd5e" },
    };

    (global as any).Actor = class MockActor {
      static createDocuments = vi.fn().mockResolvedValue([{ uuid: "Actor.1" }]);
      id = "mock-id";
      name = "Mock Actor";
      flags: any = {};
      items: any[] = [];
      getFlag = vi.fn();
      setFlag = vi.fn();
      toObject = vi.fn().mockReturnValue({});
      createEmbeddedDocuments = vi.fn();
    } as any;

    (global as any).Item = class MockItem {
      static createDocuments = vi.fn().mockResolvedValue([{ uuid: "Item.1" }]);
      id = "mock-item-id";
      name = "Mock Item";
      flags: any = {};
      getFlag = vi.fn();
      setFlag = vi.fn();
      toObject = vi.fn().mockReturnValue({});
    } as any;

    (global as any).fromUuid = vi.fn();
    (global as any).ui = { notifications: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } };
    (global as any).CompendiumCollection = { createCompendium: vi.fn() };

    (global as any).foundry = {
      applications: {
        api: {
          DialogV2: {
            confirm: vi.fn().mockResolvedValue(true),
          },
        },
      },
      utils: {
        getProperty: vi.fn(),
        randomID: vi.fn().mockReturnValue("randomid"),
        mergeObject: vi.fn((t, s) => Object.assign(t, s)),
      },
    };
  });

  it("should migrate guidance tiers and detect categories from effects", async () => {
    const tiers = [{ id: "t1", name: "Teacher", modifier: 5, costs: { cp: 100 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      if (key === "teacherCompendiums") return [];
      if (key === "bookCompendiums") return [];
      return null;
    });

    const project = new Item() as any;
    project.name = "Charisma Project";
    project.effects = [{ changes: [{ key: "system.abilities.cha.mod", value: "1" }] }];
    project.getFlag.mockImplementation((_scope: string, key: string) => {
      if (key === "isLearningProject") return true;
      if (key === "projectData") return { tutelageId: "t1" };
      return null;
    });

    const actor = new Actor() as any;
    actor.items = [project];
    (game.actors.contents as any[]).push(actor);

    const pack = {
      metadata: { id: "pack.id", collection: "pack" },
      collection: "pack",
      getIndex: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(game.packs.find).mockReturnValue(pack);

    await migrateToV3();

    expect(Actor.createDocuments).toHaveBeenCalled();
    expect(project.setFlag).toHaveBeenCalledWith(
      MODULE_ID,
      "projectData",
      expect.objectContaining({
        lastInstructorUuid: "Actor.1",
        categories: ["charisma"],
      }),
    );
  });

  it("should detect skill categories correctly", async () => {
    const tiers = [{ id: "t1", name: "Teacher", modifier: 5, costs: { cp: 100 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      if (key === "teacherCompendiums") return [];
      if (key === "bookCompendiums") return [];
      return null;
    });

    const project = new Item() as any;
    project.name = "Skill Project";
    project.effects = [{ changes: [{ key: "system.skills.arc.mod", value: "1" }] }];
    project.getFlag.mockImplementation((_scope: string, key: string) => {
      if (key === "isLearningProject") return true;
      if (key === "projectData") return { tutelageId: "t1" };
      return null;
    });

    const actor = new Actor() as any;
    actor.items = [project];
    (game.actors.contents as any[]).push(actor);

    const pack = {
      metadata: { id: "pack.id", collection: "pack" },
      collection: "pack",
      getIndex: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(game.packs.find).mockReturnValue(pack);

    await migrateToV3();

    expect(project.setFlag).toHaveBeenCalledWith(
      MODULE_ID,
      "projectData",
      expect.objectContaining({
        categories: ["arcana"],
      }),
    );
  });

  it("should migrate tiers with no cost to books", async () => {
    const tiers = [{ id: "tBook", name: "Magic Book", modifier: 2, costs: { cp: 0 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      if (key === "teacherCompendiums") return [];
      if (key === "bookCompendiums") return [];
      return null;
    });

    const project = new Item() as any;
    project.name = "Arcana Project";
    project.getFlag.mockImplementation((_scope: string, key: string) => {
      if (key === "isLearningProject") return true;
      if (key === "projectData") return { tutelageId: "tBook" };
      return null;
    });

    const actor = new Actor() as any;
    actor.items = [project];
    (game.actors.contents as any[]).push(actor);

    const pack = {
      metadata: { id: "pack.id", collection: "pack" },
      collection: "pack",
      getIndex: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(game.packs.find).mockReturnValue(pack);

    // Mock fromUuid to return the created book
    const createdBook = new Item() as any;
    createdBook.uuid = "Item.Book1";
    createdBook.getFlag.mockReturnValue({ modifier: 2 });
    createdBook.toObject.mockReturnValue({
      flags: { [MODULE_ID]: { learningBookBonus: { modifier: 2 } } },
    });
    vi.mocked(fromUuid).mockResolvedValue(createdBook);

    // Mock Actor.createDocuments for books
    vi.mocked(Item.createDocuments).mockResolvedValue([createdBook]);

    await migrateToV3();

    expect(Item.createDocuments).toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith(
      "Item",
      expect.arrayContaining([
        expect.objectContaining({
          flags: expect.objectContaining({
            [MODULE_ID]: expect.objectContaining({
              learningBookBonus: expect.objectContaining({
                modifier: 2,
              }),
            }),
          }),
        }),
      ]),
    );
  });

  it("should skip migration if GM declines", async () => {
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers")
        return [{ id: "t1", name: "T", modifier: 5, costs: { cp: 100 } }];
      return [];
    });

    const project = new Item() as any;
    project.getFlag.mockImplementation((_scope: string, key: string) => {
      if (key === "isLearningProject") return true;
      if (key === "projectData") return { tutelageId: "t1" };
      return null;
    });

    const actor = new Actor() as any;
    actor.items = [project];
    (game.actors.contents as any[]).push(actor);

    const pack = { metadata: { id: "pack.id" }, collection: "pack" };
    vi.mocked(game.packs.find).mockReturnValue(pack);

    vi.mocked(foundry.applications.api.DialogV2.confirm).mockResolvedValue(false);

    await migrateToV3();

    expect(Actor.createDocuments).not.toHaveBeenCalled();
  });

  it("should skip migration if no guidance tiers are used", async () => {
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers")
        return [{ id: "t1", name: "T", modifier: 5, costs: { cp: 100 } }];
      return [];
    });

    game.actors = { contents: [] };

    await migrateToV3();

    expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, "migrationVersion", "3.0.0");
  });
});
