import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateV1_1GpToCp } from "../src/migrations/v1_1-gp-to-cp";
import { LearningManager } from "../src/LearningManager";

describe("v1_1-gp-to-cp migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should convert guidance tier costs from gold to copper", async () => {
    const initialTiers = [{ id: "t1", name: "Tier 1", costs: { hour: 1, day: 10 } }];
    vi.mocked(game.settings.get).mockReturnValue(initialTiers);

    await migrateV1_1GpToCp();

    expect(game.settings.set).toHaveBeenCalledWith(
      LearningManager.ID,
      "guidanceTiers",
      expect.arrayContaining([
        expect.objectContaining({
          costs: { hour: 100, day: 1000 },
          _migratedToV2: true,
        }),
      ]),
    );
  });
});
