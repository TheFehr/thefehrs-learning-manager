import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV1 } from "../src/migrations/v1-relational";
import { TheFehrsLearningManager } from "../src/old_main";
import { ActorsCollection } from "./setup";

describe("v1-relational migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    game.actors = new ActorsCollection();
    game.user.isGM = true;
  });

  it("should migrate legacy projects to relational schema", async () => {
    const library: any[] = [];
    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "projectTemplates") return library;
      return null;
    });

    const actor = new Actor() as any;
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

    await migrateToV1();

    expect(actor.setFlag).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "projects",
      expect.arrayContaining([
        expect.objectContaining({
          templateId: expect.any(String),
        }),
      ]),
    );
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "projectTemplates",
      expect.arrayContaining([
        expect.objectContaining({
          name: "New Project",
          target: 100,
        }),
      ]),
    );
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "migrationVersion",
      "1.0.0",
    );
  });
});
