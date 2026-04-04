import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV2_1 } from "../src/migrations/v2_1-flexible-methods";
import { Settings } from "../src/core/settings";

vi.mock("../src/core/settings", () => ({
  Settings: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("Migration v2.1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = { notifications: { info: vi.fn(), error: vi.fn() } };
  });

  it("should migrate 'direct' method", async () => {
    vi.mocked(Settings.get).mockReturnValue({ method: "direct" });
    await migrateToV2_1();
    expect(Settings.set).toHaveBeenCalledWith(
      "rules",
      expect.objectContaining({
        nonBulkMethod: "direct",
        bulkMethod: "direct",
      }),
    );
  });

  it("should migrate 'roll' method", async () => {
    vi.mocked(Settings.get).mockReturnValue({ method: "roll" });
    await migrateToV2_1();
    expect(Settings.set).toHaveBeenCalledWith(
      "rules",
      expect.objectContaining({
        nonBulkMethod: "roll",
        bulkMethod: "roll",
      }),
    );
  });

  it("should migrate 'mathematical' method", async () => {
    vi.mocked(Settings.get).mockReturnValue({ method: "mathematical" });
    await migrateToV2_1();
    expect(Settings.set).toHaveBeenCalledWith(
      "rules",
      expect.objectContaining({
        nonBulkMethod: "roll",
        bulkMethod: "mathematical",
      }),
    );
  });

  it("should handle already migrated rules", async () => {
    vi.mocked(Settings.get).mockReturnValue({ nonBulkMethod: "roll" });
    await migrateToV2_1();
    expect(Settings.set).not.toHaveBeenCalledWith("rules", expect.anything());
  });

  it("should handle missing rules", async () => {
    vi.mocked(Settings.get).mockReturnValue(null);
    await migrateToV2_1();
    expect(Settings.set).not.toHaveBeenCalledWith("rules", expect.anything());
  });
});
