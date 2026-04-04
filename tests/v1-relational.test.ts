import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV1Relational } from "../src/migrations/v1-relational";

describe("Migration v1 (Relational)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = { notifications: { info: vi.fn() } };
    (global as any).game = {
      actors: [],
      settings: { get: vi.fn().mockReturnValue([]), set: vi.fn().mockResolvedValue(true) },
    };
    (global as any).foundry = { utils: { randomID: vi.fn().mockReturnValue("rand123") } };
  });

  it("should migrate projects without templateId", async () => {
    const mockProject = {
      name: "Legacy Project",
      maxProgress: 50,
      rewardUuid: "uuid",
      rewardType: "item",
      requirements: [],
    };
    const mockActor = {
      name: "Actor",
      getFlag: vi.fn().mockReturnValue([mockProject]),
      setFlag: vi.fn().mockResolvedValue(true),
    };
    (global as any).game.actors = [mockActor as any];

    await migrateToV1Relational();

    expect(mockActor.setFlag).toHaveBeenCalledWith(
      "thefehrs-learning-manager",
      "projects",
      expect.arrayContaining([expect.objectContaining({ templateId: "rand123" })]),
    );
    expect(game.settings.set).toHaveBeenCalledWith(
      "thefehrs-learning-manager",
      "projectTemplates",
      expect.any(Array),
    );
  });
});
