import { describe, it, expect } from "vitest";
import { ProjectUI } from "../../src/core/project-ui";

describe("ProjectUI", () => {
  describe("generateProgressHtml", () => {
    it("should generate correct HTML with escaped name", () => {
      const html = ProjectUI.generateProgressHtml(5, 10, "Test <b>Tutelage</b>");
      expect(html).toContain("Training Progress (Test &lt;b&gt;Tutelage&lt;/b&gt;)");
      expect(html).toContain("5 / 10");
      expect(html).toContain("width: 50%");
    });

    it("should handle 0 target", () => {
      const html = ProjectUI.generateProgressHtml(5, 0, "None");
      expect(html).toContain("width: 0%");
    });

    it("should clamp negative progress to 0%", () => {
      const html = ProjectUI.generateProgressHtml(-5, 10, "Neg");
      expect(html).toContain("width: 0%");
      expect(html).toContain("0 / 10");
    });

    it("should handle non-finite progress values gracefully", () => {
      const nanHtml = ProjectUI.generateProgressHtml(NaN, 10, "NaN");
      expect(nanHtml).toContain("width: 0%");
      expect(nanHtml).toContain("— / 10");

      const infHtml = ProjectUI.generateProgressHtml(Infinity, 10, "Inf");
      expect(infHtml).toContain("width: 0%");
      expect(infHtml).toContain("— / 10");
    });

    it("should clamp overflow progress to 100% width but show actual numbers", () => {
      const html = ProjectUI.generateProgressHtml(15, 10, "Overflow");
      expect(html).toContain("width: 100%");
      expect(html).toContain("15 / 10");
    });
  });

  describe("stripProgressHtml", () => {
    it("should remove progress container by comments", () => {
      const html =
        "Before <!-- learning-manager:progress-start -->Progress<!-- learning-manager:progress-end --> After";
      expect(ProjectUI.stripProgressHtml(html)).toBe("Before  After");
    });

    it("should remove progress container by class using DOMParser", () => {
      const html =
        '<div>Other content<div class="learning-manager-progress-container">Progress Bar</div>Rest</div>';
      const stripped = ProjectUI.stripProgressHtml(html);
      expect(stripped).not.toContain("learning-manager-progress-container");
      expect(stripped).toContain("Other content");
      expect(stripped).toContain("Rest");
    });

    it("should handle empty or null input", () => {
      expect(ProjectUI.stripProgressHtml("")).toBe("");
      expect(ProjectUI.stripProgressHtml(null as any)).toBe("");
    });
  });
});
