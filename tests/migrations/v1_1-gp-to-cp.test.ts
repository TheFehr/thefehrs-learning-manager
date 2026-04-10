import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateV1_1GpToCp } from "../../src/migrations/v1_1-gp-to-cp";
import { MODULE_ID } from "../../src/global";

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

    expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, "guidanceTiers", [
      expect.objectContaining({ costs: { hour: 100, day: 1000 }, _migratedGpToCp: true }),
    ]);
  });

  it("should handle already migrated tiers", async () => {
    const mockTiers = [{ id: "tier1", costs: { hour: 100 }, _migratedGpToCp: true }];
    vi.mocked(game.settings.get).mockReturnValue(mockTiers);

    await migrateV1_1GpToCp();
    expect(game.settings.set).not.toHaveBeenCalled();
  });

  it("should handle empty costs", async () => {
    const mockTiers = [{ id: "tier1", costs: {} }];
    vi.mocked(game.settings.get).mockReturnValue(mockTiers);

    await migrateV1_1GpToCp();
    // It should still mark as migrated even if costs were empty to avoid re-processing
    expect(game.settings.set).toHaveBeenCalledWith(
      MODULE_ID,
      "guidanceTiers",
      expect.arrayContaining([expect.objectContaining({ _migratedGpToCp: true })]),
    );
  });
});
