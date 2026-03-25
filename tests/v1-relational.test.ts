import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV1Relational } from "../src/migrations/v1-relational";
import { LearningManager } from "../src/LearningManager";
import { ActorsCollection } from "./setup";

describe("v1-relational migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    game.actors = new ActorsCollection();
  });

  it("should create templates from legacy projects and link them", async () => {
    const actor = new Actor() as any;
    actor.flags = {
      [LearningManager.ID]: {
        projects: [
          { name: "Project 1", maxProgress: 100, rewardUuid: "uuid1", rewardType: "item" },
        ],
      },
    };
    (game.actors as any[]).push(actor);

    vi.mocked(game.settings.get).mockReturnValue([]);

    await migrateToV1Relational();

    expect(game.settings.set).toHaveBeenCalledWith(
      LearningManager.ID,
      "projectTemplates",
      expect.arrayContaining([expect.objectContaining({ name: "Project 1", target: 100 })]),
    );

    const updatedProjects = vi.mocked(actor.setFlag).mock.calls[0][2];
    expect(updatedProjects[0].templateId).toBeDefined();
  });
});
