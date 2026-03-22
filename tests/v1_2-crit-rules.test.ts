import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV1_2 } from "../src/migrations/v1_2-crit-rules";
import { TheFehrsLearningManager } from "../src/old_main";

describe("v1_2-crit-rules migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    game.user.isGM = true;
  });

  it("should migrate critical hit rules with default values", async () => {
    const rules = { method: "roll", checkDC: 15 };
    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "rules") return rules;
      return null;
    });

    await migrateToV1_2();

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
});
