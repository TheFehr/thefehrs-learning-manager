import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ItemConfigLogic } from "../../src/logic/item-config-logic";

describe("ItemConfigLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).ui = {
      notifications: {
        error: vi.fn(),
        info: vi.fn(),
      },
    };
    (globalThis as any).CONFIG = {};
    (globalThis as any).fromUuid = vi.fn().mockResolvedValue({ documentName: "Item" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).ui;
    delete (globalThis as any).CONFIG;
    delete (globalThis as any).fromUuid;
  });

  describe("saveConfig", () => {
    it("should set flags on the item and preserve hierarchical links", async () => {
      const mockItem = {
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "projectData") return { followUpProjectId: "existing-uuid" };
          return undefined;
        }),
        update: vi.fn().mockResolvedValue(true),
      } as any;

      const requirements = [
        { id: "req1", attribute: "system.abilities.int.value", operator: ">=", value: "13" },
      ];
      const categories = ["magic"];
      const bookModifier = 2;
      const bookCategories = ["arcana"];

      const result = await ItemConfigLogic.saveConfig(
        mockItem,
        true,
        {
          target: 10,
          requirements: requirements as any,
          categories,
        },
        {
          modifier: bookModifier,
          categories: bookCategories,
        },
      );

      expect(result).toBe(true);
      expect(mockItem.update).toHaveBeenCalledWith(
        {
          "flags.thefehrs-learning-manager.learningModeEnabled": true,
          "flags.thefehrs-learning-manager.projectData": {
            target: 10,
            requirements,
            categories,
            followUpProjectId: "existing-uuid",
          },
          "flags.thefehrs-learning-manager.learningBookBonus": {
            modifier: bookModifier,
            categories: bookCategories,
          },
        },
        { render: false },
      );
    });

    it("should return false and log error on failure", async () => {
      const mockItem = {
        id: "item123",
        name: "Test Item",
        getFlag: vi.fn().mockReturnValue({}),
        update: vi.fn().mockRejectedValue(new Error("Database error")),
      } as any;

      const result = await ItemConfigLogic.saveConfig(
        mockItem,
        true,
        { target: 10, requirements: [], categories: [] },
        { modifier: 0, categories: [] },
      );
      expect(result).toBe(false);
      expect(globalThis.ui.notifications.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update document Test Item"),
      );
    });
  });
});
