import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateSettings,
  saveSettings,
  ensureCategoryExists,
  getAvailablePacks,
} from "../../src/logic/settings-logic";
import { Settings } from "../../src/core/settings";
import { toggleUserGM } from "../setup";

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

      const dataWithValidRules = { rules: { nonBulkMethod: "roll", checkDC: 15 } };
      const validated = validateSettings(dataWithValidRules);
      expect(validated.rules).toBeDefined();
      expect(validated.rules?.nonBulkMethod).toBe("roll");
      expect(validated.rules?.checkDC).toBe(15);
    });

    it("should sanitize numeric fields in rules", () => {
      const data = {
        rules: {
          checkDC: NaN,
          critThreshold: Infinity,
          nonBulkMethod: "roll",
        },
      };
      const validated = validateSettings(data);
      expect(validated.rules?.checkDC).toBe(12); // default
      expect(validated.rules?.critThreshold).toBe(20); // default
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

    it("should only accept valid notificationLevel in rules", () => {
      const data = {
        rules: {
          notificationLevel: "debug",
          nonBulkMethod: "direct",
        },
      };
      const validated = validateSettings(data);
      expect(validated.rules?.notificationLevel).toBe("debug");

      const invalidData = {
        rules: {
          notificationLevel: "invalid",
          nonBulkMethod: "direct",
        },
      };
      const validatedInvalid = validateSettings(invalidData);
      expect(validatedInvalid.rules?.notificationLevel).toBe("info");
    });
  });

  describe("saveSettings rollback", () => {
    const fullRules: import("../../src/types").SystemRules = {
      nonBulkMethod: "direct",
      bulkMethod: "direct",
      rollMode: "gmroll",
      checkDC: 10,
      checkFormula: "",
      critDoubleStrategy: "never",
      critThreshold: 20,
      notificationLevel: "info",
    };

    const fullTimeUnits: import("../../src/types").TimeUnit[] = [
      { id: "h", name: "Hour", short: "h", isBulk: false, ratio: 1 },
    ];

    beforeEach(() => {
      vi.clearAllMocks();
      toggleUserGM(true);
      // Mock Settings.get to return initial values
      vi.spyOn(Settings, "get").mockImplementation((key) => {
        if (key === "rules") return { ...fullRules };
        if (key === "timeUnits") return [...fullTimeUnits];
        if (key === "allowedCompendiums") return [];
        return undefined;
      });
    });

    it("should rollback only successful updates on failure", async () => {
      // Mock set to fail on timeUnits
      const setSpy = vi.spyOn(Settings, "set").mockImplementation(async (key, value) => {
        if (key === "timeUnits") throw new Error("Failed!");
      });

      const updatedRules = { ...fullRules, nonBulkMethod: "roll" as const };
      const updatedTimeUnits = [{ ...fullTimeUnits[0], id: "h" }];

      // Rules should be the first one in toSave
      await saveSettings(updatedRules, updatedTimeUnits, [], [], false, []);

      // Should have tried to set rules and timeUnits
      expect(setSpy).toHaveBeenCalledWith("rules", updatedRules);
      expect(setSpy).toHaveBeenCalledWith("timeUnits", updatedTimeUnits);

      // Should NOT have tried to set allowedCompendiums (because timeUnits failed)
      expect(setSpy).not.toHaveBeenCalledWith("allowedCompendiums", expect.anything());

      // Rollback should happen for rules (it was saved before timeUnits failed)
      expect(setSpy).toHaveBeenCalledWith("rules", fullRules); // rolled back to original
    });
  });

  describe("ensureCategoryExists", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return early if category is empty", async () => {
      await ensureCategoryExists("");
      expect(Settings.get).not.toHaveBeenCalled();
    });

    it("should return early if category already exists", async () => {
      vi.spyOn(Settings, "get").mockReturnValue(["Action", "Bonus Action"]);
      await ensureCategoryExists("Action");
      expect(Settings.set).not.toHaveBeenCalled();
    });

    it("should prompt and add category if it doesn't exist", async () => {
      vi.spyOn(Settings, "get").mockReturnValue(["Action"]);
      vi.spyOn(Settings, "set").mockResolvedValue(undefined as any);
      (foundry.applications.api.DialogV2.confirm as any).mockResolvedValue(true);

      await ensureCategoryExists("Bonus Action");

      expect(foundry.applications.api.DialogV2.confirm).toHaveBeenCalled();
      expect(Settings.set).toHaveBeenCalledWith("categories", ["Action", "Bonus Action"]);
    });
  });

  describe("getAvailablePacks", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      const mockPacks = [
        {
          metadata: { id: "world.items", label: "Items", type: "Item" },
          documentName: "Item",
          getIndex: vi.fn().mockResolvedValue([]),
        },
        {
          metadata: { id: "world.actors", label: "Actors", type: "Actor" },
          documentName: "Actor",
          getIndex: vi.fn().mockResolvedValue([]),
        },
      ];
      (global as any).game.packs = { contents: mockPacks };
    });

    it("should return all packs if no flagToMatch provided", async () => {
      const result = await getAvailablePacks("Item");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("world.items");
      expect(result[0].isFitting).toBe(true);
    });

    it("should filter by type", async () => {
      const result = await getAvailablePacks("Actor");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("world.actors");
    });

    it("should check index for fitting items if flagToMatch is provided", async () => {
      const pack = (global as any).game.packs.contents[0];
      pack.getIndex.mockResolvedValue([
        { name: "Teacher", "flags.thefehrs-learning-manager.teacherOfferings": [{ name: "Art" }] },
      ]);

      const result = await getAvailablePacks("Item", "teacherOfferings");
      expect(result[0].isFitting).toBe(true);
      expect(pack.getIndex).toHaveBeenCalledWith({
        fields: ["flags.thefehrs-learning-manager.teacherOfferings"],
      });
    });
  });
});
