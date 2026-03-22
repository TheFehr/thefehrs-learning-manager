import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV2 } from "../src/migrations/v2-native-items";
import { TheFehrsLearningManager } from "../src/old_main";
import { ActorsCollection } from "./setup";
import { ProjectEngine } from "../src/project-engine";

describe("v2-native-items migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    game.actors = new ActorsCollection();
    game.user.isGM = true;

    (game.packs as any) = {
      get: vi.fn().mockReturnValue({}),
      filter: vi.fn().mockReturnValue([]),
    };

    vi.spyOn(ProjectEngine, "injectActivities").mockResolvedValue(undefined);
  });

  it("should migrate legacy projects to native items and inject targets", async () => {
    const templates = [{ id: "tpl1", name: "Project 1", target: 10, rewardUuid: "item1" }];
    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "projectTemplates") return templates;
      return null;
    });

    const actor = new Actor() as any;
    actor.id = "actor1";
    actor.flags = {
      [TheFehrsLearningManager.ID]: { projects: [{ id: "p1", templateId: "tpl1", progress: 5 }] },
    };

    // Existing item-project without target
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

    const MockRewardItem = class extends Item {
      toObject() {
        return {
          name: "Reward",
          system: { activities: {} },
          effects: [],
        };
      }
    };

    global.fromUuid = vi.fn().mockResolvedValue(new MockRewardItem());

    await migrateToV2();

    expect(ProjectEngine.injectActivities).toHaveBeenCalled();
    expect(actor.setFlag).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "projects", []);
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
