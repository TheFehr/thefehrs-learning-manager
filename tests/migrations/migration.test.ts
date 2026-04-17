import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { migrateData } from "../../src/migrations/migration";
import { FoundryUtils } from "../../src/core/foundry-utils";

vi.mock("@/migrations/v1-relational", () => ({
  migrateToV1Relational: vi.fn(),
}));

vi.mock("@/migrations/v1_1-gp-to-cp", () => ({
  migrateV1_1GpToCp: vi.fn(),
}));

vi.mock("@/migrations/v1_2-crit-rules", () => ({
  migrateToV1_2: vi.fn(),
}));

vi.mock("@/migrations/v2-native-items", () => ({
  migrateToV2: vi.fn(),
}));

vi.mock("@/migrations/v2-direct", () => ({
  migrateToV2Direct: vi.fn(),
}));

vi.mock("@/migrations/v2_1-flexible-methods", () => ({
  migrateToV2_1: vi.fn(),
  migrateToV2_1_1: vi.fn(),
}));

vi.mock("@/migrations/v3-tutelage-selection", () => ({
  migrateToV3: vi.fn(),
}));

describe("migration.ts", () => {
  let mockGame: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGame = {
      user: { isGM: true },
      settings: {
        get: vi.fn().mockReturnValue("0"),
        set: vi.fn(),
      },
    };
    (globalThis as any).game = mockGame;
    (globalThis as any).ui = { notifications: { error: vi.fn() } };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).game;
    delete (globalThis as any).ui;
  });

  it("should return early if user is not GM", async () => {
    mockGame.user.isGM = false;
    await migrateData();
    expect(mockGame.settings.get).not.toHaveBeenCalled();
  });

  it("should run all migrations for a new installation", async () => {
    mockGame.settings.get.mockReturnValue("0");
    await migrateData();

    const { migrateToV2Direct } = await import("../../src/migrations/v2-direct");
    const { migrateToV2_1, migrateToV2_1_1 } =
      await import("../../src/migrations/v2_1-flexible-methods");
    const { migrateToV3 } = await import("../../src/migrations/v3-tutelage-selection");

    expect(migrateToV2Direct).toHaveBeenCalled();
    expect(migrateToV2_1).toHaveBeenCalled();
    expect(migrateToV2_1_1).toHaveBeenCalled();
    expect(migrateToV3).not.toHaveBeenCalled();
  });

  it("should skip older migrations if version is up to date", async () => {
    mockGame.settings.get.mockReturnValue("3.0.0");
    vi.spyOn(FoundryUtils, "isNewerVersion").mockReturnValue(false);

    await migrateData();

    const { migrateToV3 } = await import("../../src/migrations/v3-tutelage-selection");
    expect(migrateToV3).not.toHaveBeenCalled();
  });
});
