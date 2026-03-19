import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateData } from "../src/migration";
import { TheFehrsLearningManager } from "../src/main";
import { ActorsCollection } from "./setup";
import { ProjectEngine } from "../src/project-engine";
import { Settings } from "../src/settings";

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

    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "migrationVersion") return 0;
      if (key === "projectTemplates") return [];
      if (key === "guidanceTiers") return [];
      return null;
    });
  });

  it("should migrate version 0 to 1 with existing projects", async () => {
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

    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "migrationVersion") return 0;
      if (key === "projectTemplates") return library;
      if (key === "guidanceTiers") return [];
      return null;
    });

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

    expect(actor.setFlag).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "projects",
      expect.arrayContaining([
        expect.objectContaining({ id: "p1", templateId: "tpl1", progress: 50 }),
      ]),
    );
  });

  it("should migrate version 1 to 2 by converting gp costs to cp", async () => {
    const tiers = [
      { id: "t1", name: "Tier 1", modifier: 1, costs: { h: 1.5, d: 10.25 }, progress: {} },
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
    ]);
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
  });

  it("should skip migration if version is already 5 or higher", async () => {
    vi.mocked(game.settings.get).mockReturnValue(5);

    await migrateData();

    expect(ui.notifications.info).not.toHaveBeenCalled();
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

      global.fromUuid = vi
        .fn()
        .mockResolvedValue({
          toObject: () => ({ name: "Reward", system: { activities: {} }, effects: [] }),
        });

      await migrateData();

      expect(ProjectEngine.createProjectItem).toHaveBeenCalled();
      expect(actor.setFlag).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "projects", []);
      expect(game.settings.set).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "migrationVersion",
        4,
      );
    });
  });

  describe("v5 Migration (Template to Item data)", () => {
    it("should copy target from templates to item flags", async () => {
      const templates = [{ id: "tpl1", target: 25 }];
      vi.spyOn(Settings, "migrationVersion", "get").mockReturnValue(4);
      vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
        if (key === "migrationVersion") return 4;
        if (key === "projectTemplates") return templates;
        return null;
      });

      const item = {
        name: "Test Item",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "isLearningProject") return true;
          if (key === "") return { projectData: { templateId: "tpl1", progress: 5 } };
          return null;
        }),
        update: vi.fn().mockResolvedValue({}),
      };

      const actor = new Actor() as any;
      actor.name = "Migrate Actor";
      actor.items = [item];
      actor.flags = { [TheFehrsLearningManager.ID]: { projects: [] } };
      (game.actors as any[]).push(actor);

      await migrateData();

      expect(item.update).toHaveBeenCalledWith(
        expect.objectContaining({
          [`flags.thefehrs-learning-manager.projectData`]: expect.objectContaining({
            target: 25,
          }),
        }),
      );
      expect(game.settings.set).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "migrationVersion",
        5,
      );
    });
  });
});
