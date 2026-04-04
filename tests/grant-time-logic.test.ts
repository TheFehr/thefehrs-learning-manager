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

    it("should default non-numeric values to 0", () => {
      const input = [{ id: "hour", value: "invalid" as any }];
      expect(GrantTimeLogic.prepareSubmitData(input)).toEqual({ hour: 0 });
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
  });
});
