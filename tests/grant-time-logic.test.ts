import { describe, it, expect } from "vitest";
import { GrantTimeLogic } from "../src/apps/grant-time-logic";

describe("GrantTimeLogic", () => {
  describe("prepareSubmitData", () => {
    it("should transform array of time values into a record", () => {
      const input = [
        { id: "hour", value: 5 },
        { id: "day", value: 1 },
      ];
      const result = GrantTimeLogic.prepareSubmitData(input);
      expect(result).toEqual({ hour: 5, day: 1 });
    });

    it("should handle empty array", () => {
      expect(GrantTimeLogic.prepareSubmitData([])).toEqual({});
    });

    it("should throw error for non-numeric values", () => {
      const input = [{ id: "hour", value: "invalid" as any }];
      expect(() => GrantTimeLogic.prepareSubmitData(input)).toThrow(/Invalid time value/);
    });

    it("should throw error for NaN and Infinity", () => {
      expect(() => GrantTimeLogic.prepareSubmitData([{ id: "h", value: NaN }])).toThrow();
      expect(() => GrantTimeLogic.prepareSubmitData([{ id: "h", value: Infinity }])).toThrow();
      expect(() => GrantTimeLogic.prepareSubmitData([{ id: "h", value: -Infinity }])).toThrow();
    });

    it("should handle zero value correctly", () => {
      const input = [{ id: "hour", value: 0 }];
      expect(GrantTimeLogic.prepareSubmitData(input)).toEqual({ hour: 0 });
    });

    it("should handle very large numbers", () => {
      const input = [{ id: "hour", value: 1e30 }];
      expect(GrantTimeLogic.prepareSubmitData(input)).toEqual({ hour: 1e30 });
    });

    it("should throw error for empty string ID", () => {
      const input = [{ id: "", value: 5 }];
      expect(() => GrantTimeLogic.prepareSubmitData(input)).toThrow(
        /Invalid or missing time unit ID/,
      );
    });

    it("should handle duplicate ids by letting the last one win", () => {
      const input = [
        { id: "hour", value: 5 },
        { id: "hour", value: 10 },
      ];
      expect(GrantTimeLogic.prepareSubmitData(input)).toEqual({ hour: 10 });
    });

    it("should handle negative values", () => {
      const input = [{ id: "hour", value: -2 }];
      expect(GrantTimeLogic.prepareSubmitData(input)).toEqual({ hour: -2 });
    });

    it("should handle floating-point values", () => {
      const input = [{ id: "hour", value: 1.5 }];
      expect(GrantTimeLogic.prepareSubmitData(input)).toEqual({ hour: 1.5 });
    });
  });

  describe("toggleRecipient", () => {
    it("should add ID if not present", () => {
      const result = GrantTimeLogic.toggleRecipient("actor1", []);
      expect(result).toEqual(["actor1"]);
    });

    it("should remove ID if present", () => {
      const result = GrantTimeLogic.toggleRecipient("actor1", ["actor1", "actor2"]);
      expect(result).toEqual(["actor2"]);
    });

    it("should handle empty string ID by ignoring it", () => {
      const result = GrantTimeLogic.toggleRecipient("", ["actor1"]);
      expect(result).toEqual(["actor1"]);
    });

    it("should handle null/undefined ID by ignoring them", () => {
      expect(GrantTimeLogic.toggleRecipient(null as any, ["a"])).toEqual(["a"]);
      expect(GrantTimeLogic.toggleRecipient(undefined as any, ["a"])).toEqual(["a"]);
    });

    it("should remove all occurrences if multiple present (edge case behavior)", () => {
      const result = GrantTimeLogic.toggleRecipient("actor1", ["actor1", "actor2", "actor1"]);
      expect(result).toEqual(["actor2"]);
    });

    it("should not mutate the input array", () => {
      const input = ["actor1", "actor2"];
      const originalInput = [...input];
      GrantTimeLogic.toggleRecipient("actor3", input);
      expect(input).toEqual(originalInput);

      GrantTimeLogic.toggleRecipient("actor1", input);
      expect(input).toEqual(originalInput);
    });
  });
});
