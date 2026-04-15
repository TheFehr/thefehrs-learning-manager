import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  searchWithOmnisearchOrQuickInsert,
  extractItemUuidFromDrop,
} from "../../src/logic/config-utils";
import { Logger } from "../../src/core/logger";

describe("ConfigUtils", () => {
  describe("searchWithOmnisearchOrQuickInsert", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      (global as any).CONFIG = {};
      (global as any).fromUuid = vi.fn();
      vi.spyOn(Logger, "error").mockImplementation(() => {});
      vi.spyOn(Logger, "warn").mockImplementation(() => {});
      vi.spyOn(Logger, "info").mockImplementation(() => {});
    });

    it("should use Spotlight Omnisearch if available", async () => {
      const mockResult = { data: { uuid: "Item.123" } };
      const mockDoc = { documentName: "Item" };
      (global as any).CONFIG.SpotlightOmnisearch = {
        prompt: vi.fn().mockResolvedValue(mockResult),
      };
      (global as any).fromUuid.mockResolvedValue(mockDoc);

      const result = await searchWithOmnisearchOrQuickInsert();

      expect(result).toBe("Item.123");
      expect(global.CONFIG.SpotlightOmnisearch.prompt).toHaveBeenCalled();
    });

    it("should return null if Spotlight Omnisearch returns no result", async () => {
      (global as any).CONFIG.SpotlightOmnisearch = {
        prompt: vi.fn().mockResolvedValue(null),
      };

      const result = await searchWithOmnisearchOrQuickInsert();
      expect(result).toBeNull();
    });

    it("should use Quick Insert if Spotlight Omnisearch is not available", async () => {
      const mockQuickInsert = {
        open: vi.fn().mockImplementation(({ onSubmit }) => {
          onSubmit({ uuid: "Item.456" });
        }),
        search: vi.fn(),
      };
      (global as any).game.modules.get = vi.fn().mockReturnValue({
        active: true,
        api: mockQuickInsert,
      });
      (global as any).fromUuid.mockResolvedValue({ documentName: "Item" });

      const result = await searchWithOmnisearchOrQuickInsert();

      expect(result).toBe("Item.456");
      expect(mockQuickInsert.open).toHaveBeenCalled();
    });

    it("should handle Quick Insert onClose", async () => {
      const mockQuickInsert = {
        open: vi.fn().mockImplementation(({ onClose }) => {
          onClose();
        }),
        search: vi.fn(),
      };
      (global as any).game.modules.get = vi.fn().mockReturnValue({
        active: true,
        api: mockQuickInsert,
      });

      const result = await searchWithOmnisearchOrQuickInsert();
      expect(result).toBeNull();
    });

    it("should handle Spotlight Omnisearch error", async () => {
      (global as any).CONFIG.SpotlightOmnisearch = {
        prompt: vi.fn().mockRejectedValue(new Error("Omnisearch failed")),
      };
      (global as any).game.modules.get = vi.fn().mockReturnValue(undefined);

      const result = await searchWithOmnisearchOrQuickInsert();
      expect(result).toBeNull();
      expect(Logger.error).toHaveBeenCalled();
    });

    it("should handle Quick Insert error", async () => {
      (global as any).CONFIG.SpotlightOmnisearch = undefined;
      (global as any).game.modules.get = vi.fn().mockImplementation(() => {
        throw new Error("Quick Insert failed");
      });

      const result = await searchWithOmnisearchOrQuickInsert();
      expect(result).toBeNull();
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe("extractItemUuidFromDrop", () => {
    it("should extract UUID from valid drop data", () => {
      const mockEvent = {
        dataTransfer: {
          getData: vi.fn().mockReturnValue(JSON.stringify({ type: "Item", uuid: "Item.789" })),
        },
      } as any;

      const result = extractItemUuidFromDrop(mockEvent);
      expect(result).toBe("Item.789");
    });

    it("should return null for invalid JSON", () => {
      const mockEvent = {
        dataTransfer: {
          getData: vi.fn().mockReturnValue("invalid-json"),
        },
      } as any;

      const result = extractItemUuidFromDrop(mockEvent);
      expect(result).toBeNull();
    });

    it("should return null if no data is present", () => {
      const mockEvent = {
        dataTransfer: {
          getData: vi.fn().mockReturnValue(""),
        },
      } as any;

      const result = extractItemUuidFromDrop(mockEvent);
      expect(result).toBeNull();
    });
  });
});
