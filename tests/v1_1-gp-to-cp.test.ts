import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV1_1 } from "../src/migrations/v1_1-gp-to-cp";
import { TheFehrsLearningManager } from "../src/old_main";

describe("v1_1-gp-to-cp migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    game.user.isGM = true;
  });

  it("should migrate guidance costs from gp to cp", async () => {
    const tiers = [{ id: "t1", name: "Tier 1", costs: { h: 1.5 } }];
    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "guidanceTiers") return tiers;
      return null;
    });

    await migrateToV1_1();

    expect(game.settings.set).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "guidanceTiers", [
      expect.objectContaining({
        costs: { h: 150 },
        _migratedToV2: true,
      }),
    ]);
    expect(game.settings.set).toHaveBeenCalledWith(
      TheFehrsLearningManager.ID,
      "migrationVersion",
      "1.1.0",
    );
  });
});
