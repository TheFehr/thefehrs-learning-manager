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

    (game.packs as any) = {
      get: vi.fn().mockReturnValue({}),
      filter: vi.fn().mockReturnValue([]),
    };
    (game.settings.get as any) = vi.fn().mockImplementation((scope, key) => {
      if (key === "migrationVersion") return "0";
      if (key === "projectTemplates") return [];
      if (key === "guidanceTiers") return [];
      return null;
    });
  });

  it("should migrate version 0 to 1.0.0 with existing projects", async () => {
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
      if (key === "migrationVersion") return "0";
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

    expect(actor.setFlag).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "projects", []);
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "migrationVersion",
      "2.0.0",
    );
  });

  it("should migrate version 1.0.0 to 1.1.0 (costs to cp)", async () => {
    const tiers = [{ id: "t1", name: "Tier 1", modifier: 1, costs: { h: 1.5 }, progress: {} }];

    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "migrationVersion") return "1.0.0";
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
        costs: { h: 150 },
        progress: {},
        _migratedToV2: true,
      },
    ]);
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "migrationVersion",
      "1.1.0",
    );
  });

  it("should migrate version 1.1.0 to 1.2.0 (crit rules)", async () => {
    const rules = { method: "roll", checkDC: 15 };

    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "migrationVersion") return "1.1.0";
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
      "1.2.0",
    );
  });

  it("should skip migration if version is already 2.0.0 or higher", async () => {
    vi.spyOn(Settings, "migrationVersion", "get").mockReturnValue("2.0.0");

    await migrateData();

    expect(ui.notifications.info).not.toHaveBeenCalled();
  });

  describe("2.0.0 Migration (Merged Native Items & Template-less)", () => {
    it("should migrate legacy projects AND inject targets", async () => {
      const timeUnits = [{ id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 }];
      const templates = [{ id: "tpl1", name: "Project 1", target: 10 }];

      vi.spyOn(Settings, "migrationVersion", "get").mockReturnValue("1.2.0");
      vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
        if (key === "migrationVersion") return "1.2.0";
        if (key === "timeUnits") return timeUnits;
        if (key === "projectTemplates") return templates;
        if (key === "guidanceTiers") return [];
        return null;
      });

      const actor = new Actor() as any;
      actor.id = "actor1";
      actor.flags = {
        [TheFehrsLearningManager.ID]: { projects: [{ id: "p1", templateId: "tpl1", progress: 5 }] },
      };

      // Existing item-project without target (already partially migrated or from v4)
      const item = {
        name: "Test Item",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "isLearningProject") return true;
          if (key === "projectData") return { templateId: "tpl1", progress: 5 };
          return null;
        }),
        update: vi.fn().mockResolvedValue({}),
      };
      actor.items = [item];
      (game.actors as any[]).push(actor);

      global.fromUuid = vi.fn().mockResolvedValue({
        toObject: () => ({ name: "Reward", system: { activities: {} }, effects: [] }),
      });

      await migrateData();

      // Legacy project migration (former v4 part)
      expect(ProjectEngine.createProjectItem).toHaveBeenCalled();
      expect(actor.setFlag).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "projects", []);

      // Template target injection (former v5 part)
      expect(item.update).toHaveBeenCalledWith(
        expect.objectContaining({
          [`flags.thefehrs-learning-manager.projectData`]: expect.objectContaining({
            target: 10,
          }),
        }),
      );

      expect(game.settings.set).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "migrationVersion",
        "2.0.0",
      );
    });
  });

  describe("Direct Migration (0 -> 2.0.0)", () => {
    it("should perform a direct migration and reach the same state as incremental", async () => {
      const initialTiers = [{ id: "t1", costs: { h: 1.5 } }];

      vi.spyOn(Settings, "migrationVersion", "get").mockReturnValue("0");
      vi.spyOn(Settings, "rules", "get").mockReturnValue({ method: "roll" } as any);
      vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
        if (key === "migrationVersion") return "0";
        if (key === "guidanceTiers") return initialTiers;
        if (key === "projectTemplates") return [];
        return null;
      });

      const actor = new Actor() as any;
      actor.id = "actor1";
      actor.flags = {
        [TheFehrsLearningManager.ID]: {
          projects: [
            {
              id: "p1",
              name: "New Project",
              progress: 10,
              maxProgress: 100,
              rewardUuid: "item1",
              rewardType: "item",
            },
          ],
        },
      };
      (game.actors as any[]).push(actor);

      global.fromUuid = vi.fn().mockResolvedValue({
        toObject: () => ({ name: "Reward", system: { activities: {} }, effects: [] }),
      });

      vi.mocked(game.settings.set).mockClear();
      console.debug("Downtime Engine | Test: Starting migrateData");
      await migrateData();
      console.debug(
        "Downtime Engine | Test: migrateData finished, set calls:",
        game.settings.set.mock.calls,
      );

      // 1. Rules updated
      expect(game.settings.set).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "rules",
        expect.objectContaining({
          critDoubleStrategy: "never",
          critThreshold: 10,
        }),
      );

      // 2. Tiers updated (GP to CP)
      expect(game.settings.set).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "guidanceTiers",
        expect.arrayContaining([
          expect.objectContaining({ costs: { h: 150 }, _migratedToV2: true }),
        ]),
      );

      // 3. Library updated
      expect(game.settings.set).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "projectTemplates",
        expect.arrayContaining([expect.objectContaining({ name: "New Project", target: 100 })]),
      );

      // 4. Item created
      expect(ProjectEngine.createProjectItem).toHaveBeenCalled();

      // 5. Actor projects cleared
      expect(actor.setFlag).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "projects", []);

      // 6. Version updated
      expect(game.settings.set).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "migrationVersion",
        "2.0.0",
      );
    });
  });
});
