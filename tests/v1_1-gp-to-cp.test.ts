import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateV1_1GpToCp } from "../src/migrations/v1_1-gp-to-cp";
import { Settings } from "../src/core/settings";

vi.mock("../src/core/settings", () => ({
  Settings: {
    ID: "thefehrs-learning-manager",
    guidanceTiers: [],
    set: vi.fn(),
  },
}));

describe("Migration v1.1 (GP to CP)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = { notifications: { info: vi.fn(), error: vi.fn() } };
    (global as any).game = {
      settings: {
        get: vi.fn(),
        set: vi.fn().mockResolvedValue(true),
      },
    };
  });

  it("should migrate tier costs from gp to cp", async () => {
    const mockTiers = [{ id: "tier1", costs: { hour: 1, day: 10 } }];
    vi.mocked(game.settings.get).mockReturnValue(mockTiers);

    await migrateV1_1GpToCp();

    expect(game.settings.set).toHaveBeenCalledWith("thefehrs-learning-manager", "guidanceTiers", [
      expect.objectContaining({ costs: { hour: 100, day: 1000 }, _migratedToV2: true }),
    ]);
  });

  it("should handle already migrated or empty costs", async () => {
    const mockTiers = [{ id: "tier1", costs: {}, _migratedToV2: true }];
    vi.mocked(game.settings.get).mockReturnValue(mockTiers);

    await migrateV1_1GpToCp();
    expect(game.settings.set).not.toHaveBeenCalled();
  });
});
