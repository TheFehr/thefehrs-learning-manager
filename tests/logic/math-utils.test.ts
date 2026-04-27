import { describe, it, expect } from "vitest";
import { combinations, getBinomialP, getDieExpectation } from "@/logic/math-utils";

describe("math-utils", () => {
  describe("combinations", () => {
    it("should calculate correctly", () => {
      expect(combinations(5, 0)).toBe(1);
      expect(combinations(5, 1)).toBe(5);
      expect(combinations(5, 2)).toBe(10);
      expect(combinations(5, 3)).toBe(10);
      expect(combinations(5, 4)).toBe(5);
      expect(combinations(5, 5)).toBe(1);
    });

    it("should handle out of bounds", () => {
      expect(combinations(5, -1)).toBe(0);
      expect(combinations(5, 6)).toBe(0);
    });
  });

  describe("getBinomialP", () => {
    it("should calculate P(X >= k) correctly", () => {
      // 2 trials, p=0.5. X ~ B(2, 0.5)
      // P(X=0) = 0.25, P(X=1) = 0.5, P(X=2) = 0.25
      // P(X >= 1) = 0.75
      expect(getBinomialP(2, 1, 0.5)).toBe(0.75);
      // P(X >= 2) = 0.25
      expect(getBinomialP(2, 2, 0.5)).toBe(0.25);
    });

    it("should normalize non-integer k using Math.ceil", () => {
      // P(X >= 0.5) should be same as P(X >= 1)
      expect(getBinomialP(2, 0.5, 0.5)).toBe(0.75);
      // P(X >= 1.2) should be same as P(X >= 2)
      expect(getBinomialP(2, 1.2, 0.5)).toBe(0.25);
    });
  });

  describe("getDieExpectation", () => {
    it("should return average for simple dice", () => {
      // (1 + 20) / 2 = 10.5
      expect(getDieExpectation(1, 20)).toBe(10.5);
      // 2 * 10.5 = 21
      expect(getDieExpectation(2, 20)).toBe(21);
    });

    it("should handle kh1 (advantage)", () => {
      // 2d20kh1 expectation is ~13.825
      expect(getDieExpectation(2, 20, "kh", 1)).toBeCloseTo(13.825, 3);
    });

    it("should handle kl1 (disadvantage)", () => {
      // 2d20kl1 expectation is ~7.175
      expect(getDieExpectation(2, 20, "kl", 1)).toBeCloseTo(7.175, 3);
    });

    it("should handle dh1 (keep lowest)", () => {
      // 2d20dh1 is same as 2d20kl1
      expect(getDieExpectation(2, 20, "dh", 1)).toBeCloseTo(7.175, 3);
    });

    it("should handle dl1 (keep highest)", () => {
      // 2d20dl1 is same as 2d20kh1
      expect(getDieExpectation(2, 20, "dl", 1)).toBeCloseTo(13.825, 3);
    });

    it("should handle k > 1", () => {
      // 3d20kh2 expectation:
      // Order statistics of 3d20: X(1) < X(2) < X(3)
      // kh2 = X(2) + X(3)
      // E[X(1)] = 5.5125
      // E[X(2)] = 10.5
      // E[X(3)] = 15.4875
      // E[X(2) + X(3)] = 10.5 + 15.4875 = 25.9875
      expect(getDieExpectation(3, 20, "kh", 2)).toBeCloseTo(25.9875, 4);
    });

    it("should fallback for unsupported modifiers", () => {
      expect(getDieExpectation(1, 20, "invalid")).toBe(10.5);
    });

    it("should handle k=0", () => {
      expect(getDieExpectation(1, 20, "kh", 0)).toBe(0);
    });

    it("should handle k=count", () => {
      expect(getDieExpectation(2, 20, "kh", 2)).toBe(21);
    });

    it("should default modValue to 1 if undefined", () => {
      expect(getDieExpectation(2, 20, "kh", undefined)).toBeCloseTo(13.825, 3);
    });

    it("should fallback for non-numeric or infinite modValue", () => {
      // 2d20 simple average is 21
      expect(getDieExpectation(2, 20, "kh", NaN)).toBe(21);
      expect(getDieExpectation(2, 20, "kh", Infinity)).toBe(21);
    });

    it("should floor fractional modValue", () => {
      // 2d20kh1.5 should be same as 2d20kh1
      expect(getDieExpectation(2, 20, "kh", 1.5)).toBeCloseTo(13.825, 3);
    });

    it("should clamp modValue to [0, count]", () => {
      // 2d20kh3 should be same as 2d20kh2
      expect(getDieExpectation(2, 20, "kh", 3)).toBe(21);
      // 2d20kh-1 should be same as 2d20kh0
      expect(getDieExpectation(2, 20, "kh", -1)).toBe(0);
    });

    it("should throw RangeError for invalid count", () => {
      expect(() => getDieExpectation(0, 20)).toThrow(RangeError);
      expect(() => getDieExpectation(-1, 20)).toThrow(RangeError);
      expect(() => getDieExpectation(1.5, 20)).toThrow(RangeError);
    });

    it("should throw RangeError for invalid faces", () => {
      expect(() => getDieExpectation(1, 0)).toThrow(RangeError);
      expect(() => getDieExpectation(1, -1)).toThrow(RangeError);
      expect(() => getDieExpectation(1, 20.5)).toThrow(RangeError);
    });
  });
});
