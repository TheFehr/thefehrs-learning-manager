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

  it("should not call game.settings.set if rules already contain both keys", async () => {
    const initialRules = {
      method: "roll",
      critDoubleStrategy: "any",
      critThreshold: 19,
    };
    vi.mocked(game.settings.get).mockReturnValue(initialRules);

    await migrateToV1_2();

    expect(game.settings.set).not.toHaveBeenCalled();
  });

  it("should log error and rethrow if migration fails", async () => {
    const error = new Error("Migration failed");
    vi.mocked(game.settings.get).mockImplementation(() => {
      throw error;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(migrateToV1_2()).rejects.toThrow(error);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("migration to v1.2.0 failed"),
      error,
    );
  });
});
