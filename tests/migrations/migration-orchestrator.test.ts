import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateData } from "../../src/migrations/migration";
import { Settings } from "../../src/core/settings";

import * as v1Relational from "../../src/migrations/v1-relational";
import * as v1_1gpToCp from "../../src/migrations/v1_1-gp-to-cp";
import * as v1_2critRules from "../../src/migrations/v1_2-crit-rules";
import * as v2NativeItems from "../../src/migrations/v2-native-items";
import * as v2Direct from "../../src/migrations/v2-direct";
import * as v2_1flexibleMethods from "../../src/migrations/v2_1-flexible-methods";

describe("Data Migration Orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    game.user.isGM = true;
    (game.settings.get as any) = vi.fn().mockImplementation((scope, key) => {
      if (key === "migrationVersion") return "0";
      return null;
    });

    vi.spyOn(v1Relational, "migrateToV1Relational").mockResolvedValue(undefined);
    vi.spyOn(v1_1gpToCp, "migrateV1_1GpToCp").mockResolvedValue(undefined);
    vi.spyOn(v1_2critRules, "migrateToV1_2").mockResolvedValue(undefined);
    vi.spyOn(v2NativeItems, "migrateToV2").mockResolvedValue(undefined);
    vi.spyOn(v2Direct, "migrateToV2Direct").mockResolvedValue(undefined);
    vi.spyOn(v2_1flexibleMethods, "migrateToV2_1").mockResolvedValue(undefined);
    vi.spyOn(v2_1flexibleMethods, "migrateToV2_1_1").mockResolvedValue(undefined);
  });

  it("should always call migrateToV2Direct if version is 0", async () => {
    vi.mocked(game.settings.get).mockReturnValue("0");
    await migrateData();
    expect(v2Direct.migrateToV2Direct).toHaveBeenCalled();
    expect(v2_1flexibleMethods.migrateToV2_1).toHaveBeenCalled();
    expect(v2_1flexibleMethods.migrateToV2_1_1).toHaveBeenCalled();
  });

  it("should call all migrations if version < 1.0.0", async () => {
    vi.mocked(game.settings.get).mockReturnValue("0.0.0");
    await migrateData();
    expect(v1Relational.migrateToV1Relational).toHaveBeenCalled();
    expect(v1_1gpToCp.migrateV1_1GpToCp).toHaveBeenCalled();
    expect(v1_2critRules.migrateToV1_2).toHaveBeenCalled();
    expect(v2NativeItems.migrateToV2).toHaveBeenCalled();
    expect(v2_1flexibleMethods.migrateToV2_1).toHaveBeenCalled();
    expect(v2_1flexibleMethods.migrateToV2_1_1).toHaveBeenCalled();
  });

  it("should call migrateToV2 if version is 1.2.0", async () => {
    vi.mocked(game.settings.get).mockReturnValue("1.2.0");
    await migrateData();
    expect(v1Relational.migrateToV1Relational).not.toHaveBeenCalled();
    expect(v1_1gpToCp.migrateV1_1GpToCp).not.toHaveBeenCalled();
    expect(v1_2critRules.migrateToV1_2).not.toHaveBeenCalled();
    expect(v2NativeItems.migrateToV2).toHaveBeenCalled();
    expect(v2_1flexibleMethods.migrateToV2_1).toHaveBeenCalled();
    expect(v2_1flexibleMethods.migrateToV2_1_1).toHaveBeenCalled();
  });

  it("should do nothing if version is 2.1.1", async () => {
    vi.mocked(game.settings.get).mockReturnValue("2.1.1");
    await migrateData();
    expect(v2Direct.migrateToV2Direct).not.toHaveBeenCalled();
    expect(v2NativeItems.migrateToV2).not.toHaveBeenCalled();
    expect(v2_1flexibleMethods.migrateToV2_1).not.toHaveBeenCalled();
    expect(v2_1flexibleMethods.migrateToV2_1_1).not.toHaveBeenCalled();
  });

  it("should normalize legacy integer versions > 0 to 1.2.0 and only call migrateToV2 and later", async () => {
    vi.mocked(game.settings.get).mockReturnValue("3");
    await migrateData();
    expect(v1Relational.migrateToV1Relational).not.toHaveBeenCalled();
    expect(v1_1gpToCp.migrateV1_1GpToCp).not.toHaveBeenCalled();
    expect(v1_2critRules.migrateToV1_2).not.toHaveBeenCalled();
    expect(v2NativeItems.migrateToV2).toHaveBeenCalled();
    expect(v2_1flexibleMethods.migrateToV2_1).toHaveBeenCalled();
    expect(v2_1flexibleMethods.migrateToV2_1_1).toHaveBeenCalled();
  });

  it("should handle migration errors gracefully", async () => {
    vi.mocked(game.settings.get).mockReturnValue("0.0.0");
    vi.mocked(v1Relational.migrateToV1Relational).mockRejectedValue(new Error("Fail"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(migrateData()).rejects.toThrow("Fail");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Migration failed"),
      expect.any(Error),
    );
  });
});
