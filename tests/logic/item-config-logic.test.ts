import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ItemConfigLogic } from "../../src/logic/item-config-logic";
import { getModuleAPI } from "../../src/types";

vi.mock("@/types", () => ({
  getModuleAPI: vi.fn(),
}));

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
    it("should set flags on the item", async () => {
      const mockItem = {
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
          followUpProjectId: "uuid123",
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
            followUpProjectId: "uuid123",
            requirements,
            categories,
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
        update: vi.fn().mockRejectedValue(new Error("Database error")),
      } as any;

      const result = await ItemConfigLogic.saveConfig(
        mockItem,
        true,
        { target: 10, followUpProjectId: "", requirements: [], categories: [] },
        { modifier: 0, categories: [] },
      );
      expect(result).toBe(false);
      expect(globalThis.ui.notifications.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update document Test Item"),
      );
    });
  });

  describe("searchFollowUp", () => {
    it("should use SpotlightOmnisearch if available", async () => {
      (globalThis as any).CONFIG.SpotlightOmnisearch = {
        prompt: vi.fn().mockResolvedValue({ data: { uuid: "spotlight-uuid" } }),
      };

      const result = await ItemConfigLogic.searchFollowUp();
      expect(result).toBe("spotlight-uuid");
      expect((globalThis as any).CONFIG.SpotlightOmnisearch.prompt).toHaveBeenCalled();
    });

    it("should use QuickInsert if Spotlight is unavailable", async () => {
      (globalThis as any).CONFIG.SpotlightOmnisearch = null;
      const mockQuickInsert = {
        open: vi.fn().mockImplementation((config: any) => {
          config.onSubmit({ uuid: "quick-uuid" });
        }),
      };
      vi.mocked(getModuleAPI).mockReturnValue(mockQuickInsert as any);

      const result = await ItemConfigLogic.searchFollowUp();
      expect(result).toBe("quick-uuid");
      expect(mockQuickInsert.open).toHaveBeenCalled();
    });

    it("should notify and return null if no modules found", async () => {
      (globalThis as any).CONFIG.SpotlightOmnisearch = null;
      vi.mocked(getModuleAPI).mockReturnValue(undefined);

      const result = await ItemConfigLogic.searchFollowUp();
      expect(result).toBeNull();
      expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining("not found"));
    });
  });

  describe("handleDrop", () => {
    it("should extract UUID from valid Item drop data", () => {
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          getData: vi.fn().mockReturnValue(JSON.stringify({ type: "Item", uuid: "dropped-uuid" })),
        },
      } as any;

      const result = ItemConfigLogic.handleDrop(mockEvent);
      expect(result).toBe("dropped-uuid");
    });

    it("should return null for non-Item drops", () => {
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          getData: vi.fn().mockReturnValue(JSON.stringify({ type: "Actor", uuid: "actor-uuid" })),
        },
      } as any;

      const result = ItemConfigLogic.handleDrop(mockEvent);
      expect(result).toBeNull();
    });

    it("should return null if data is missing or malformed", () => {
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          getData: vi.fn().mockReturnValue("invalid-json"),
        },
      } as any;

      expect(ItemConfigLogic.handleDrop(mockEvent)).toBeNull();
    });
  });
});
