import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentUtils } from "../../src/core/document-utils";
import { MODULE_ID } from "../../src/global";

describe("DocumentUtils", () => {
  let mockDoc: any;

  beforeEach(() => {
    mockDoc = {
      name: "Test Doc",
      id: "test-id",
      update: vi.fn().mockResolvedValue(true),
    };
    vi.clearAllMocks();
  });

  describe("setFlagsSilently", () => {
    it("should set flags with MODULE_ID and render: false", async () => {
      const flags = { key1: "value1", key2: "value2" };
      const result = await DocumentUtils.setFlagsSilently(mockDoc, flags);

      expect(result).toBe(true);
      expect(mockDoc.update).toHaveBeenCalledWith(
        {
          [`flags.${MODULE_ID}.key1`]: "value1",
          [`flags.${MODULE_ID}.key2`]: "value2",
        },
        { render: false },
      );
    });

    it("should return false if document is invalid", async () => {
      const result = await DocumentUtils.setFlagsSilently(null, { key: "value" });
      expect(result).toBe(false);
    });

    it("should return false if update fails", async () => {
      mockDoc.update.mockRejectedValue(new Error("Update failed"));
      const result = await DocumentUtils.setFlagsSilently(mockDoc, { key: "value" });
      expect(result).toBe(false);
    });
  });

  describe("unsetFlagsSilently", () => {
    it("should unset flags with -= syntax and render: false", async () => {
      const keys = ["key1", "key2"];
      const result = await DocumentUtils.unsetFlagsSilently(mockDoc, keys);

      expect(result).toBe(true);
      expect(mockDoc.update).toHaveBeenCalledWith(
        {
          [`flags.${MODULE_ID}.-=key1`]: null,
          [`flags.${MODULE_ID}.-=key2`]: null,
        },
        { render: false },
      );
    });

    it("should return false if document is invalid", async () => {
      const result = await DocumentUtils.unsetFlagsSilently(undefined, ["key"]);
      expect(result).toBe(false);
    });

    it("should return false if update fails", async () => {
      mockDoc.update.mockRejectedValue(new Error("Update failed"));
      const result = await DocumentUtils.unsetFlagsSilently(mockDoc, ["key"]);
      expect(result).toBe(false);
    });
  });

  describe("updateSilently", () => {
    it("should update document with render: false", async () => {
      const data = { name: "New Name", "system.value": 10 };
      const result = await DocumentUtils.updateSilently(mockDoc, data);

      expect(result).toBe(true);
      expect(mockDoc.update).toHaveBeenCalledWith(data, { render: false });
    });

    it("should return false if document is invalid", async () => {
      const result = await DocumentUtils.updateSilently({}, { key: "value" });
      expect(result).toBe(false);
    });

    it("should return false if update fails", async () => {
      mockDoc.update.mockRejectedValue(new Error("Update failed"));
      const result = await DocumentUtils.updateSilently(mockDoc, { key: "value" });
      expect(result).toBe(false);
    });
  });
});
