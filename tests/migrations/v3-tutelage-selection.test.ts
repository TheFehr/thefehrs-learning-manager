import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV3 } from "../../src/migrations/v3-tutelage-selection";
import { MODULE_ID } from "../../src/global";

describe("v3-tutelage-selection migration", () => {
  let packs: any[];

  function makePack(id: string, index: any[] = [], type: string = "Actor") {
    const existing = packs.find(
      (p) => p.metadata?.id === id || p.collection === id || p.metadata?.name === id,
    );
    if (existing) {
      existing.getIndex.mockResolvedValue(index);
      existing.metadata.type = type;
      return existing;
    }
    const p = {
      metadata: {
        id,
        collection: id.split(".")[1] || id,
        name: id.split(".")[1] || id,
        type: type,
      },
      collection: id.split(".")[1] || id,
      getIndex: vi.fn().mockResolvedValue(index),
      importDocument: vi.fn().mockImplementation(async (doc) => doc),
    };
    packs.push(p);
    return p;
  }

  function makeItem(name: string, flags: Record<string, any> = {}, effects: any[] = []) {
    const item = new (globalThis as any).Item() as any;
    item.name = name;
    item.effects = effects;
    item.getFlag.mockImplementation((_scope: string, key: string) => {
      if (key === "isLearningProject") return flags.isLearningProject;
      if (key === "projectData") return flags.projectData;
      return null;
    });
    return item;
  }

  function makeActor(items: any[] = []) {
    const actor = new (globalThis as any).Actor() as any;
    actor.items = items;
    (game.actors.contents as any[]).push(actor);
    return actor;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    packs = [];
    (packs as any).get = vi
      .fn()
      .mockImplementation((id: string) =>
        packs.find((p) => p.metadata?.id === id || p.collection === id || p.metadata?.name === id),
      );
    (packs as any).find = vi
      .fn()
      .mockImplementation((fn: any) => Array.prototype.find.call(packs, fn));

    makePack("legacy-tutelage-instructors", [], "Actor");
    makePack("legacy-tutelage-books", [], "Item");

    (globalThis as any).game = {
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

    (globalThis as any).Actor = class MockActor {
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

    (globalThis as any).Item = class MockItem {
      static createDocuments = vi.fn().mockResolvedValue([{ uuid: "Item.1" }]);
      id = "mock-item-id";
      name = "Mock Item";
      flags: any = {};
      getFlag = vi.fn();
      setFlag = vi.fn();
      toObject = vi.fn().mockReturnValue({});
    } as any;

    (globalThis as any).fromUuid = vi.fn();
    (globalThis as any).ui = { notifications: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } };
    (globalThis as any).CompendiumCollection = {
      createCompendium: vi.fn().mockImplementation(async (data: any) => {
        return makePack(data.name || data.label);
      }),
    };

    (globalThis as any).foundry = {
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

    const project = makeItem(
      "Charisma Project",
      { isLearningProject: true, projectData: { tutelageId: "t1" } },
      [{ changes: [{ key: "system.abilities.cha.mod", value: "1" }] }],
    );
    makeActor([project]);

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

    const project = makeItem(
      "Skill Project",
      { isLearningProject: true, projectData: { tutelageId: "t1" } },
      [{ changes: [{ key: "system.skills.arc.mod", value: "1" }] }],
    );
    makeActor([project]);
    makePack("pack.id");

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

    const project = makeItem("Arcana Project", {
      isLearningProject: true,
      projectData: { tutelageId: "tBook" },
    });
    const actor = makeActor([project]);
    makePack("pack.id");

    const createdBook = new Item() as any;
    createdBook.uuid = "Item.Book1";
    createdBook.getFlag.mockReturnValue({ modifier: 2 });
    createdBook.toObject.mockReturnValue({
      flags: { [MODULE_ID]: { learningBookBonus: { modifier: 2 } } },
    });
    vi.mocked(fromUuid).mockResolvedValue(createdBook);
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

    const project = makeItem("T", { isLearningProject: true, projectData: { tutelageId: "t1" } });
    makeActor([project]);
    makePack("pack.id");

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

    await migrateToV3();

    expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, "migrationVersion", "3.0.0");
  });

  it("should handle error when getting guidance tiers by not advancing version if projects exist", async () => {
    const project = makeItem("T", { isLearningProject: true, projectData: { tutelageId: "t1" } });
    makeActor([project]);

    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") throw new Error("Not found");
      return null;
    });

    await migrateToV3();

    expect(game.settings.set).not.toHaveBeenCalledWith(MODULE_ID, "migrationVersion", "3.0.0");
  });

  it("should skip and retry if rawTiers is empty but projects exist", async () => {
    const project = makeItem("T", { isLearningProject: true, projectData: { tutelageId: "t1" } });
    makeActor([project]);

    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return [];
      return null;
    });

    await migrateToV3();

    expect(game.settings.set).not.toHaveBeenCalledWith(MODULE_ID, "migrationVersion", "3.0.0");
  });

  it("should mark as complete if no projects are found using tiers", async () => {
    await migrateToV3();
    expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, "migrationVersion", "3.0.0");
  });

  it("should handle failure to create compendiums", async () => {
    packs.length = 0;
    const tiers = [{ id: "t1", name: "Teacher", modifier: 5, costs: { cp: 100 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      return null;
    });

    const project = makeItem("T", { isLearningProject: true, projectData: { tutelageId: "t1" } });
    makeActor([project]);

    vi.mocked(CompendiumCollection.createCompendium).mockRejectedValue(new Error("Failed"));

    await migrateToV3();

    expect(ui.notifications.info).not.toHaveBeenCalledWith(expect.stringContaining("complete"));
    expect(game.settings.set).not.toHaveBeenCalledWith(MODULE_ID, "migrationVersion", "3.0.0");
  });

  it("should use existing legacy instructor if already created in pack", async () => {
    const tiers = [{ id: "t1", name: "Teacher", modifier: 5, costs: { cp: 100 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      if (key === "teacherCompendiums") return [];
      if (key === "bookCompendiums") return [];
      return null;
    });

    const project = makeItem("T", { isLearningProject: true, projectData: { tutelageId: "t1" } });
    makeActor([project]);
    makePack("legacy-tutelage-instructors", [
      {
        _id: "existingId",
        flags: {
          [MODULE_ID]: {
            legacyTierId: "t1",
            teacherOfferings: [{ modifier: 5 }],
          },
        },
      },
    ]);
    makePack("legacy-tutelage-books");

    await migrateToV3();

    expect(Actor.createDocuments).not.toHaveBeenCalled();
    expect(project.setFlag).toHaveBeenCalledWith(
      MODULE_ID,
      "projectData",
      expect.objectContaining({
        lastInstructorUuid: "Compendium.legacy-tutelage-instructors.Actor.existingId",
      }),
    );
  });

  it("should handle creation errors gracefully", async () => {
    const tiers = [{ id: "t1", name: "Teacher", modifier: 5, costs: { cp: 100 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      if (key === "teacherCompendiums") return [];
      if (key === "bookCompendiums") return [];
      return null;
    });

    const project = makeItem("T", { isLearningProject: true, projectData: { tutelageId: "t1" } });
    makeActor([project]);
    makePack("pack.id");
    vi.mocked(Actor.createDocuments).mockRejectedValue(new Error("Creation failed"));

    await migrateToV3();

    expect(ui.notifications.warn).toHaveBeenCalledWith(
      expect.stringContaining("partially completed"),
    );
  });

  it("should handle empty results from createDocuments as failures", async () => {
    const tiers = [{ id: "t1", name: "Teacher", modifier: 5, costs: { cp: 100 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      if (key === "teacherCompendiums") return [];
      if (key === "bookCompendiums") return [];
      return null;
    });

    const project = makeItem("T", { isLearningProject: true, projectData: { tutelageId: "t1" } });
    makeActor([project]);
    makePack("pack.id");
    vi.mocked(Actor.createDocuments).mockResolvedValue([]);

    await migrateToV3();

    expect(ui.notifications.warn).toHaveBeenCalledWith(
      expect.stringContaining("partially completed"),
    );
  });

  it("should handle empty results from Item.createDocuments as failures", async () => {
    const tiers = [{ id: "tBook", name: "Magic Book", modifier: 2, costs: { cp: 0 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      if (key === "teacherCompendiums") return [];
      if (key === "bookCompendiums") return [];
      return null;
    });

    const project = makeItem("Arcana Project", {
      isLearningProject: true,
      projectData: { tutelageId: "tBook" },
    });
    makeActor([project]);
    makePack("pack.id");
    vi.mocked(Item.createDocuments).mockResolvedValue([]);

    await migrateToV3();

    expect(ui.notifications.warn).toHaveBeenCalledWith(
      expect.stringContaining("partially completed"),
    );
  });

  it("should handle orphaned tier IDs by resetting them", async () => {
    const tiers = [{ id: "t1", name: "Teacher", modifier: 5, costs: { cp: 100 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      return [];
    });

    const project = makeItem("T", {
      isLearningProject: true,
      projectData: { tutelageId: "orphaned" },
    });
    makeActor([project]);
    makePack("pack.id");

    await migrateToV3();

    expect(project.setFlag).toHaveBeenCalledWith(
      MODULE_ID,
      "projectData",
      expect.objectContaining({ tutelageId: "" }),
    );
  });

  it("should preserve tutelageId if it is in rawTiers but mapping failed (not an orphan)", async () => {
    const tiers = [{ id: "failed-tier", name: "Failed Teacher", modifier: 5, costs: { cp: 100 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      if (key === "teacherCompendiums") return [];
      if (key === "bookCompendiums") return [];
      return null;
    });

    const project = makeItem("Failed Project", {
      isLearningProject: true,
      projectData: { tutelageId: "failed-tier" },
    });
    makeActor([project]);
    makePack("pack.id");

    vi.mocked(Actor.createDocuments).mockResolvedValue([]);

    await migrateToV3();

    expect(project.setFlag).not.toHaveBeenCalledWith(MODULE_ID, "projectData", expect.anything());
    expect(ui.notifications.warn).toHaveBeenCalledWith(
      expect.stringContaining("partially completed with 1 project failures"),
    );
  });

  it("should treat +0 as orphaned even if not in rawTiers", async () => {
    const tiers = [{ id: "t1", name: "Teacher", modifier: 5, costs: { cp: 100 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      return [];
    });

    const project = makeItem("T", { isLearningProject: true, projectData: { tutelageId: "+0" } });
    makeActor([project]);
    makePack("pack.id");

    await migrateToV3();

    expect(project.setFlag).toHaveBeenCalledWith(
      MODULE_ID,
      "projectData",
      expect.objectContaining({ tutelageId: "" }),
    );
  });

  it("should migrate tiers with no cost and non-positive modifier to self-study", async () => {
    const tiers = [{ id: "tSelf", name: "Self Study", modifier: 0, costs: { cp: 0 } }];
    vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
      if (key === "guidanceTiers") return tiers;
      if (key === "teacherCompendiums") return [];
      if (key === "bookCompendiums") return [];
      return null;
    });

    const project = makeItem("Self Project", {
      isLearningProject: true,
      projectData: { tutelageId: "tSelf" },
    });
    makeActor([project]);
    makePack("pack.id");

    await migrateToV3();

    expect(project.setFlag).toHaveBeenCalledWith(
      MODULE_ID,
      "projectData",
      expect.objectContaining({
        tutelageId: "",
      }),
    );
    expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining("complete"));
  });
});
