import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV1_2 } from "../../src/migrations/v1_2-crit-rules";
import { MODULE_ID } from "../../src/global";

describe("v1_2-crit-rules migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should add default critical hit rules to settings", async () => {
    const initialRules = { method: "roll" };
    vi.mocked(game.settings.get).mockReturnValue(initialRules);

    await migrateToV1_2();

    expect(game.settings.set).toHaveBeenCalledWith(
      MODULE_ID,
      "rules",
      expect.objectContaining({
        critDoubleStrategy: "never",
        critThreshold: 20,
        method: "roll",
      }),
    );
  });

  it("should add critThreshold if critDoubleStrategy is already set", async () => {
    const initialRules = { method: "roll", critDoubleStrategy: "any" };
    vi.mocked(game.settings.get).mockReturnValue(initialRules);

    await migrateToV1_2();

    expect(game.settings.set).toHaveBeenCalledWith(
      MODULE_ID,
      "rules",
      expect.objectContaining({
        critDoubleStrategy: "any",
        critThreshold: 20,
      }),
    );
  });
});
