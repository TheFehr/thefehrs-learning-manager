import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateData } from "../src/migration";
import { TheFehrsLearningManager } from "../src/main";
import { ActorsCollection } from "./setup";
import { ProjectEngine } from "../src/project-engine";

vi.mock("../src/project-engine", () => ({
  ProjectEngine: {
    createProjectItem: vi.fn(),
  },
}));

describe("Data Migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    game.actors = new ActorsCollection();
    game.user.isGM = true;
  });

  it("should migrate version 0 to 1 with existing projects", async () => {
    // Setup existing project templates
    const library = [
      {
        id: "tpl1",
        name: "Existing Project",
        target: 100,
        rewardUuid: "item1",
        rewardType: "item",
        requirements: [],
      },
    ];

    // Mock settings
    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "migrationVersion") return 0;
      if (key === "projectTemplates") return library;
      if (key === "guidanceTiers") return [];
      return null;
    });

    // Setup an actor with old-style project (no templateId)
    const actor = new Actor() as any;
    actor.name = "Test Actor";
    actor.flags = {
      [TheFehrsLearningManager.ID]: {
        projects: [
          {
            id: "p1",
            name: "Existing Project",
            progress: 50,
            maxProgress: 100,
            rewardUuid: "item1",
            rewardType: "item",
          },
        ],
      },
    };
    (game.actors as any[]).push(actor);

    await migrateData();

    // Check if actor flag was updated
    expect(actor.setFlag).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "projects",
      expect.arrayContaining([
        expect.objectContaining({
          id: "p1",
          templateId: "tpl1",
          progress: 50,
        }),
      ]),
    );
  });

  it("should create a new template if matching one is not found in library", async () => {
    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "migrationVersion") return 0;
      if (key === "projectTemplates") return [];
      if (key === "guidanceTiers") return [];
      return null;
    });

    const actor = new Actor() as any;
    actor.flags = {
      [TheFehrsLearningManager.ID]: {
        projects: [{ id: "p1", name: "Brand New Project", progress: 10, maxProgress: 50 }],
      },
    };
    (game.actors as any[]).push(actor);

    await migrateData();

    // Check if a new template was added to library
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "projectTemplates",
      expect.arrayContaining([
        expect.objectContaining({
          name: "Brand New Project",
          target: 50,
        }),
      ]),
    );

    // Check if actor project now points to the new template
    const setFlagCall = vi.mocked(actor.setFlag).mock.calls.find((call) => call[1] === "projects");
    expect(setFlagCall![2][0].templateId).toBe("randomid");
  });

  it("should create a new template if name matches but other fields differ", async () => {
    const library = [
      {
        id: "tpl1",
        name: "Conflicting Project",
        target: 100,
        rewardUuid: "item1",
        rewardType: "item",
        requirements: [],
      },
    ];

    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "migrationVersion") return 0;
      if (key === "projectTemplates") return library;
      if (key === "guidanceTiers") return [];
      return null;
    });

    const actor = new Actor() as any;
    actor.flags = {
      [TheFehrsLearningManager.ID]: {
        projects: [
          {
            id: "p1",
            name: "Conflicting Project",
            progress: 10,
            maxProgress: 50,
            rewardUuid: "item2",
            rewardType: "item",
          },
        ],
      },
    };
    (game.actors as any[]).push(actor);

    await migrateData();

    // Check if a new template was added to library
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "projectTemplates",
      expect.arrayContaining([
        expect.objectContaining({
          name: "Conflicting Project",
          target: 50,
          rewardUuid: "item2",
        }),
      ]),
    );

    // Check if actor project now points to the new template
    const setFlagCall = vi.mocked(actor.setFlag).mock.calls.find((call) => call[1] === "projects");
    expect(setFlagCall![2][0].templateId).not.toBe("tpl1");
    expect(setFlagCall![2][0].templateId).toBe("randomid");
  });

  it("should migrate version 1 to 2 by converting gp costs to cp", async () => {
    const tiers = [
      { id: "t1", name: "Tier 1", modifier: 1, costs: { h: 1.5, d: 10.25 }, progress: {} },
      { id: "t2", name: "Tier 2", modifier: 2, costs: { h: 0, d: 5 }, progress: {} },
    ];

    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "migrationVersion") return 1;
      if (key === "guidanceTiers") return tiers;
      if (key === "projectTemplates") return [];
      return null;
    });

    await migrateData();

    expect(game.settings.set).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "guidanceTiers", [
      {
        id: "t1",
        name: "Tier 1",
        modifier: 1,
        costs: { h: 150, d: 1025 },
        progress: {},
        _migratedToV2: true,
      },
      {
        id: "t2",
        name: "Tier 2",
        modifier: 2,
        costs: { h: 0, d: 500 },
        progress: {},
        _migratedToV2: true,
      },
    ]);

    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "migrationVersion",
      2,
    );
  });

  it("should migrate version 2 to 3 by setting default crit rules", async () => {
    const rules = { method: "roll", checkDC: 15 };

    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "migrationVersion") return 2;
      if (key === "rules") return rules;
      if (key === "projectTemplates") return [];
      if (key === "guidanceTiers") return [];
      return null;
    });

    await migrateData();

    expect(game.settings.set).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "rules", {
      method: "roll",
      checkDC: 15,
      critDoubleStrategy: "never",
      critThreshold: 10,
    });

    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "migrationVersion",
      3,
    );
  });

  it("should skip migration if version is already 4 or higher", async () => {
    vi.mocked(game.settings.get).mockReturnValue(4);

    await migrateData();

    expect(ui.notifications.info).not.toHaveBeenCalled();
    expect(game.settings.set).not.toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "migrationVersion",
      expect.anything(),
    );
  });

  describe("v4 Migration (Flags to Items)", () => {
    it("should convert flag projects to items and clear flags", async () => {
      const timeUnits = [{ id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 }];

      vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
        if (key === "migrationVersion") return 3;
        if (key === "timeUnits") return timeUnits;
        if (key === "projectTemplates")
          return [
            {
              id: "tpl1",
              name: "Project 1",
              target: 10,
              rewardUuid: "Item.123",
              rewardType: "item",
              requirements: [],
            },
          ];
        if (key === "guidanceTiers") return [];
        return null;
      });

      const actor = new Actor() as any;
      actor.id = "actor1";
      actor.flags = {
        [TheFehrsLearningManager.ID]: {
          projects: [{ id: "p1", templateId: "tpl1", progress: 5, guidanceTierId: "" }],
        },
      };
      (game.actors as any[]).push(actor);

      // Mock fromUuid to return a base item for the template
      global.fromUuid = vi.fn().mockResolvedValue({
        toObject: () => ({ name: "Reward", system: { activities: {} }, effects: [] }),
      });

      // Mock compendium
      game.packs = {
        get: vi.fn().mockReturnValue({}),
      } as any;

      await migrateData();

      // Should have created an item via ProjectEngine
      expect(ProjectEngine.createProjectItem).toHaveBeenCalled();

      // Should have cleared projects flag
      expect(actor.setFlag).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "projects", []);

      // Should have updated version to 4
      expect(game.settings.set).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "migrationVersion",
        4,
      );
    });

    it("should create a compendium if it doesn't exist", async () => {
      vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
        if (key === "migrationVersion") return 3;
        if (key === "timeUnits") return [];
        if (key === "projectTemplates") return [];
        return null;
      });

      game.packs = {
        get: vi.fn().mockReturnValue(undefined),
      } as any;

      await migrateData();

      expect(CompendiumCollection.createCompendium).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "ude-migration",
          type: "Item",
        }),
      );
    });
  });

  it("should skip migration if user is not GM", async () => {
    vi.mocked(game.settings.get).mockReturnValue(0);
    game.user.isGM = false;

    await migrateData();

    expect(ui.notifications.info).not.toHaveBeenCalled();
  });
});
