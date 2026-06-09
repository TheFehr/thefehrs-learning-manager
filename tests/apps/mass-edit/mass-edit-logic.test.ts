import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildPackIndex,
  buildWorldActorIndex,
  loadFullDocument,
  loadConfiguredDocuments,
  activateDocument,
  createAndActivateDocument,
  getAvailableDestinations,
} from "@/apps/mass-edit/mass-edit-logic.js";
import { MODULE_ID } from "@/global.js";
import { ActorsCollection } from "../../setup.js";

const FLAG_PATH = `flags.${MODULE_ID}.learningModeEnabled`;

function makePack(overrides: Record<string, unknown> = {}) {
  return {
    metadata: { id: "world.test-pack", label: "Test Pack", type: "Item" },
    documentName: "Item",
    locked: false,
    getIndex: vi.fn().mockResolvedValue([]),
    getDocument: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeIndexEntry(id: string, name: string, enabled: boolean): Record<string, unknown> {
  return {
    _id: id,
    name,
    flags: { [MODULE_ID]: { learningModeEnabled: enabled } },
  };
}

describe("buildPackIndex", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns entries for each document in the pack with correct fields", async () => {
    const pack = makePack({
      getIndex: vi
        .fn()
        .mockResolvedValue([
          makeIndexEntry("id1", "Arcana", true),
          makeIndexEntry("id2", "Stealth", false),
        ]),
    });
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(pack);

    const entries = await buildPackIndex(["world.test-pack"], "Item");

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      _id: "id1",
      name: "Arcana",
      packId: "world.test-pack",
      uuid: "Compendium.world.test-pack.Item.id1",
      learningModeEnabled: true,
    });
    expect(entries[1].learningModeEnabled).toBe(false);
  });

  it("skips packs whose docType does not match", async () => {
    const actorPack = makePack({
      metadata: { id: "world.actors", label: "Actors", type: "Actor" },
      documentName: "Actor",
    });
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(actorPack);

    const entries = await buildPackIndex(["world.actors"], "Item");
    expect(entries).toHaveLength(0);
  });

  it("skips a pack that does not exist in game.packs", async () => {
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(undefined);

    const entries = await buildPackIndex(["world.missing"], "Item");
    expect(entries).toHaveLength(0);
  });

  it("skips a pack whose getIndex throws", async () => {
    const pack = makePack({ getIndex: vi.fn().mockRejectedValue(new Error("No index")) });
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(pack);

    await expect(buildPackIndex(["world.test-pack"], "Item")).resolves.toEqual([]);
  });

  it("constructs Actor UUID using the Actor segment", async () => {
    const pack = makePack({
      metadata: { id: "world.teachers", label: "Teachers", type: "Actor" },
      documentName: "Actor",
      getIndex: vi.fn().mockResolvedValue([makeIndexEntry("npc1", "Gandalf", true)]),
    });
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(pack);

    const entries = await buildPackIndex(["world.teachers"], "Actor");
    expect(entries[0].uuid).toBe("Compendium.world.teachers.Actor.npc1");
  });

  it("processes multiple packs and concatenates their entries", async () => {
    const pack1 = makePack({
      metadata: { id: "world.pack1", label: "P1", type: "Item" },
      documentName: "Item",
      getIndex: vi.fn().mockResolvedValue([makeIndexEntry("a", "Alpha", true)]),
    });
    const pack2 = makePack({
      metadata: { id: "world.pack2", label: "P2", type: "Item" },
      documentName: "Item",
      getIndex: vi.fn().mockResolvedValue([makeIndexEntry("b", "Beta", false)]),
    });
    (globalThis as any).game.packs.get = vi
      .fn()
      .mockImplementation((id: string) => (id === "world.pack1" ? pack1 : pack2));

    const entries = await buildPackIndex(["world.pack1", "world.pack2"], "Item");
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe("Alpha");
    expect(entries[1].name).toBe("Beta");
  });
});

describe("buildWorldActorIndex", () => {
  afterEach(() => {
    (globalThis as any).game.actors = new ActorsCollection();
  });

  it("returns entries for world actors with correct shape", () => {
    const mockActor = {
      id: "world-actor-1",
      name: "Elminster",
      uuid: "Actor.world-actor-1",
      getFlag: vi.fn().mockImplementation((scope: string, key: string) => {
        if (scope === MODULE_ID && key === "learningModeEnabled") return true;
        return null;
      }),
    };
    const actors = new ActorsCollection();
    actors.push(mockActor);
    (globalThis as any).game.actors = actors;

    const entries = buildWorldActorIndex();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      _id: "world-actor-1",
      name: "Elminster",
      packId: "",
      uuid: "Actor.world-actor-1",
      learningModeEnabled: true,
    });
  });

  it("marks actors without the flag as not enabled", () => {
    const mockActor = {
      id: "npc-2",
      name: "Drizzt",
      uuid: "Actor.npc-2",
      getFlag: vi.fn().mockReturnValue(null),
    };
    const actors = new ActorsCollection();
    actors.push(mockActor);
    (globalThis as any).game.actors = actors;

    const entries = buildWorldActorIndex();
    expect(entries[0].learningModeEnabled).toBe(false);
  });
});

describe("loadFullDocument", () => {
  it("loads document from a compendium pack", async () => {
    const fakeDoc = { id: "item-1", name: "Fireball" };
    const pack = makePack({ getDocument: vi.fn().mockResolvedValue(fakeDoc) });
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(pack);

    const result = await loadFullDocument({
      _id: "item-1",
      name: "Fireball",
      packId: "world.pack",
      uuid: "",
      learningModeEnabled: true,
    });
    expect(result).toBe(fakeDoc);
  });

  it("loads a world actor when packId is empty", () => {
    const fakeActor = { id: "actor-1", name: "Gandalf" };
    (globalThis as any).game.actors = new ActorsCollection();
    (globalThis as any).game.actors.push(fakeActor);
    (globalThis as any).game.actors.get = vi.fn().mockReturnValue(fakeActor);

    const result = loadFullDocument({
      _id: "actor-1",
      name: "Gandalf",
      packId: "",
      uuid: "",
      learningModeEnabled: true,
    });
    expect(result).resolves.toBe(fakeActor);
  });

  it("returns null when the pack is not found", async () => {
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(undefined);

    const result = await loadFullDocument({
      _id: "x",
      name: "x",
      packId: "world.ghost",
      uuid: "",
      learningModeEnabled: false,
    });
    expect(result).toBeNull();
  });

  it("returns null when pack.getDocument throws", async () => {
    const pack = makePack({ getDocument: vi.fn().mockRejectedValue(new Error("Not found")) });
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(pack);

    const result = await loadFullDocument({
      _id: "x",
      name: "x",
      packId: "world.pack",
      uuid: "",
      learningModeEnabled: false,
    });
    expect(result).toBeNull();
  });
});

describe("loadConfiguredDocuments", () => {
  it("returns only documents whose entry is learningModeEnabled", async () => {
    const docA = { id: "a", name: "Enabled" };
    const docB = { id: "b", name: "Disabled" };
    const packA = makePack({ getDocument: vi.fn().mockResolvedValue(docA) });
    const packB = makePack({
      metadata: { id: "world.pack-b", label: "Pack B", type: "Item" },
      getDocument: vi.fn().mockResolvedValue(docB),
    });

    (globalThis as any).game.packs.get = vi
      .fn()
      .mockImplementation((id: string) => (id === "world.test-pack" ? packA : packB));

    const entries = [
      { _id: "a", name: "Enabled", packId: "world.test-pack", uuid: "", learningModeEnabled: true },
      { _id: "b", name: "Disabled", packId: "world.pack-b", uuid: "", learningModeEnabled: false },
    ];

    const docs = await loadConfiguredDocuments(entries);
    expect(docs).toHaveLength(1);
    expect((docs[0] as any).name).toBe("Enabled");
  });

  it("silently skips entries whose document fails to load", async () => {
    const goodDoc = { id: "good", name: "Good" };
    const goodPack = makePack({ getDocument: vi.fn().mockResolvedValue(goodDoc) });
    const badPack = makePack({
      metadata: { id: "world.bad", label: "Bad", type: "Item" },
      getDocument: vi.fn().mockRejectedValue(new Error("missing")),
    });
    (globalThis as any).game.packs.get = vi
      .fn()
      .mockImplementation((id: string) => (id === "world.test-pack" ? goodPack : badPack));

    const entries = [
      { _id: "good", name: "Good", packId: "world.test-pack", uuid: "", learningModeEnabled: true },
      { _id: "bad", name: "Bad", packId: "world.bad", uuid: "", learningModeEnabled: true },
    ];

    const docs = await loadConfiguredDocuments(entries);
    expect(docs).toHaveLength(1);
    expect((docs[0] as any).name).toBe("Good");
  });
});

describe("activateDocument", () => {
  it("sets the learningModeEnabled flag and returns the document", async () => {
    const setFlag = vi.fn().mockResolvedValue(undefined);
    const doc = { id: "doc-1", name: "Spell", setFlag };
    const pack = makePack({ getDocument: vi.fn().mockResolvedValue(doc) });
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(pack);

    const entry = {
      _id: "doc-1",
      name: "Spell",
      packId: "world.test-pack",
      uuid: "",
      learningModeEnabled: false,
    };
    const result = await activateDocument(entry);

    expect(setFlag).toHaveBeenCalledWith(MODULE_ID, "learningModeEnabled", true);
    expect(result).toBe(doc);
  });

  it("returns null when the document cannot be loaded", async () => {
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(undefined);

    const result = await activateDocument({
      _id: "x",
      name: "x",
      packId: "world.ghost",
      uuid: "",
      learningModeEnabled: false,
    });
    expect(result).toBeNull();
  });
});

describe("createAndActivateDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an Item in a compendium pack and activates it", async () => {
    const setFlag = vi.fn().mockResolvedValue(undefined);
    const newDoc = { id: "new-1", name: "New Feat", setFlag };
    const mockCreate = vi.fn().mockResolvedValue(newDoc);
    (globalThis as any).CONFIG.Item = { documentClass: { create: mockCreate } };

    const result = await createAndActivateDocument("Item", "New Feat", "feat", "world.pack");

    expect(mockCreate).toHaveBeenCalledWith(
      { name: "New Feat", type: "feat" },
      { pack: "world.pack" },
    );
    expect(setFlag).toHaveBeenCalledWith(MODULE_ID, "learningModeEnabled", true);
    expect(result).toBe(newDoc);
  });

  it("creates an Actor in the world when packId is empty", async () => {
    const setFlag = vi.fn().mockResolvedValue(undefined);
    const newActor = { id: "new-npc", name: "New NPC", setFlag };
    const mockCreate = vi.fn().mockResolvedValue(newActor);
    (globalThis as any).CONFIG.Actor = { documentClass: { create: mockCreate } };

    await createAndActivateDocument("Actor", "New NPC", "npc", "");

    expect(mockCreate).toHaveBeenCalledWith({ name: "New NPC", type: "npc" }, {});
  });

  it("returns null when create throws", async () => {
    (globalThis as any).CONFIG.Item = {
      documentClass: { create: vi.fn().mockRejectedValue(new Error("Permission denied")) },
    };

    const result = await createAndActivateDocument("Item", "Bad", "feat", "world.pack");
    expect(result).toBeNull();
  });
});

describe("getAvailableDestinations", () => {
  it("includes unlocked packs", () => {
    const pack = makePack({ locked: false });
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(pack);

    const dests = getAvailableDestinations(["world.test-pack"]);
    expect(dests.some((d) => d.id === "world.test-pack")).toBe(true);
  });

  it("excludes locked packs", () => {
    const pack = makePack({ locked: true });
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(pack);

    const dests = getAvailableDestinations(["world.test-pack"]);
    expect(dests.some((d) => d.id === "world.test-pack")).toBe(false);
  });

  it("always includes World as the last entry", () => {
    (globalThis as any).game.packs.get = vi.fn().mockReturnValue(undefined);

    const dests = getAvailableDestinations(["world.pack"]);
    const last = dests[dests.length - 1];
    expect(last).toMatchObject({ id: "", label: "World" });
  });
});
