import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateSettings, saveSettings } from "../src/apps/settings-logic";
import { Settings } from "../src/core/settings";

describe("settings-logic", () => {
  describe("validateSettings", () => {
    it("should return empty result for null or non-object data", () => {
      expect(validateSettings(null)).toEqual({});
      expect(validateSettings(undefined)).toEqual({});
      expect(validateSettings("string")).toEqual({});
      expect(validateSettings(123)).toEqual({});
      expect(validateSettings([])).toEqual({});
    });

    it("should only accept rules if it is a plain object", () => {
      const dataWithArrayRules = { rules: [] };
      expect(validateSettings(dataWithArrayRules)).toEqual({});

      const dataWithValidRules = { rules: { method: "roll", checkDC: 15 } };
      const validated = validateSettings(dataWithValidRules);
      expect(validated.rules).toBeDefined();
      expect(validated.rules?.method).toBe("roll");
      expect(validated.rules?.checkDC).toBe(15);
    });

    it("should sanitize numeric fields in rules", () => {
      const data = {
        rules: {
          checkDC: NaN,
          critThreshold: Infinity,
          method: "roll",
        },
      };
      const validated = validateSettings(data);
      expect(validated.rules?.checkDC).toBe(10); // default
      expect(validated.rules?.critThreshold).toBe(20); // default
    });

    it("should sanitize guidanceTiers numeric records", () => {
      const data = {
        guidanceTiers: [
          {
            id: "tier1",
            costs: { gp: 10, sp: "invalid", cp: null, bp: NaN },
            progress: { hour: 1, day: [10] },
          },
        ],
      };
      const validated = validateSettings(data);
      expect(validated.guidanceTiers?.[0].costs).toEqual({ gp: 10 });
      expect(validated.guidanceTiers?.[0].progress).toEqual({ hour: 1 });
    });

    it("should preserve _migratedToV2 flag in guidanceTiers", () => {
      const data = {
        guidanceTiers: [
          { id: "tier1", _migratedToV2: true },
          { id: "tier2", _migratedToV2: "not-a-boolean" },
        ],
      };
      const validated = validateSettings(data);
      expect(validated.guidanceTiers?.[0]._migratedToV2).toBe(true);
      expect(validated.guidanceTiers?.[1]._migratedToV2).toBe(false);
    });

    it("should only accept boolean for isBulk in timeUnits", () => {
      const data = {
        timeUnits: [
          { id: "h", isBulk: true },
          { id: "d", isBulk: "truthy-string" },
          { id: "w", isBulk: 1 },
        ],
      };
      const validated = validateSettings(data);
      expect(validated.timeUnits?.[0].isBulk).toBe(true);
      expect(validated.timeUnits?.[1].isBulk).toBe(false);
      expect(validated.timeUnits?.[2].isBulk).toBe(false);
    });
  });

  describe("saveSettings rollback", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Mock Settings getters
      vi.spyOn(Settings, "rules", "get").mockReturnValue({ method: "direct" });
      vi.spyOn(Settings, "timeUnits", "get").mockReturnValue([]);
      vi.spyOn(Settings, "guidanceTiers", "get").mockReturnValue([]);
      vi.spyOn(Settings, "allowedCompendiums", "get").mockReturnValue([]);
    });

    it("should rollback only successful updates on failure", async () => {
      const setRulesSpy = vi.spyOn(Settings, "setRules").mockResolvedValue(undefined);
      const setTimeUnitsSpy = vi
        .spyOn(Settings, "setTimeUnits")
        .mockRejectedValue(new Error("Failed!"));
      const setGuidanceTiersSpy = vi.spyOn(Settings, "setGuidanceTiers");
      const setAllowedCompendiumsSpy = vi.spyOn(Settings, "setAllowedCompendiums");

      await saveSettings({ method: "roll" } as any, [{ id: "h" }] as any, [], []);

      // Should have tried to set rules and timeUnits
      expect(setRulesSpy).toHaveBeenCalledWith({ method: "roll" });
      expect(setTimeUnitsSpy).toHaveBeenCalled();

      // Should NOT have tried to set guidanceTiers or allowedCompendiums
      expect(setGuidanceTiersSpy).not.toHaveBeenCalledWith([], expect.anything()); // wait, it was never called in the first place

      // Rollback should only happen for rules
      // Note: the first call was for the save, the second for rollback
      expect(setRulesSpy).toHaveBeenCalledTimes(2);
      expect(setRulesSpy).toHaveBeenLastCalledWith({ method: "direct" }); // rolled back to original

      expect(setTimeUnitsSpy).toHaveBeenCalledTimes(1); // failed, so no rollback call for it
    });
  });
});
