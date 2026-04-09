import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ItemConfigLogic } from "../src/logic/item-config-logic";
import { getModuleAPI } from "../src/types";

vi.mock("../src/types", () => ({
  getModuleAPI: vi.fn(),
}));

describe("ItemConfigLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = {
      notifications: {
        error: vi.fn(),
        info: vi.fn(),
      },
    };
    (global as any).CONFIG = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).ui;
    delete (global as any).CONFIG;
  });

  describe("saveConfig", () => {
    it("should set flags on the item", async () => {
      const mockItem = {
        setFlag: vi.fn().mockResolvedValue(true),
      } as any;
      const requirements = [{ attribute: "system.abilities.int.value", operator: ">=", value: 13 }];

      const result = await ItemConfigLogic.saveConfig(mockItem, 10, "uuid123", requirements as any);

      expect(result).toBe(true);
      expect(mockItem.setFlag).toHaveBeenCalledWith("thefehrs-learning-manager", "projectData", {
        target: 10,
        followUpProjectId: "uuid123",
        requirements,
      });
    });

    it("should handle errors and notify user", async () => {
      const mockItem = {
        setFlag: vi.fn().mockRejectedValue(new Error("Database error")),
      } as any;

      await expect(ItemConfigLogic.saveConfig(mockItem, 10, "", [])).rejects.toThrow(
        "Database error",
      );
      expect(ui.notifications.error).toHaveBeenCalledWith(
        expect.stringContaining("Database error"),
      );
    });
  });

  describe("searchFollowUp", () => {
    it("should use SpotlightOmnisearch if available", async () => {
      (global as any).CONFIG.SpotlightOmnisearch = {
        prompt: vi.fn().mockResolvedValue({ data: { uuid: "spotlight-uuid" } }),
      };

      const result = await ItemConfigLogic.searchFollowUp();
      expect(result).toBe("spotlight-uuid");
      expect(CONFIG.SpotlightOmnisearch.prompt).toHaveBeenCalled();
    });

    it("should use QuickInsert if Spotlight is unavailable", async () => {
      (global as any).CONFIG.SpotlightOmnisearch = null;
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
      (global as any).CONFIG.SpotlightOmnisearch = null;
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
