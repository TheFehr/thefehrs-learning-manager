import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV2Direct } from "../src/migrations/v2-direct";
import { TheFehrsLearningManager } from "../src/old_main";
import { ActorsCollection } from "./setup";
import { ProjectEngine } from "../src/project-engine";

describe("v2-direct migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    game.actors = new ActorsCollection();
    game.user.isGM = true;

    vi.spyOn(ProjectEngine, "injectActivities").mockResolvedValue(undefined);
  });

  it("should perform direct migration from 0 to 2.0.0", async () => {
    const initialTiers = [{ id: "t1", costs: { h: 1.5 } }];
    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "guidanceTiers") return initialTiers;
      if (key === "projectTemplates") return [];
      if (key === "rules") return { method: "roll" };
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

    await migrateToV2Direct();

    // Rules
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "rules",
      expect.objectContaining({ critDoubleStrategy: "never" }),
    );
    // Tiers
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "guidanceTiers",
      expect.arrayContaining([expect.objectContaining({ costs: { h: 150 } })]),
    );
    // Item created & projects cleared
    expect(ProjectEngine.injectActivities).toHaveBeenCalled();
    expect(actor.setFlag).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "projects", []);
    // Version
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "migrationVersion",
      "2.0.0",
    );
  });
});
