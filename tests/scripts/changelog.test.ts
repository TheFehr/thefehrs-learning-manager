import { describe, it, expect } from "vitest";
// @ts-expect-error plain ESM script without type declarations
import { addSection } from "../../scripts/changelog-add.mjs";
// @ts-expect-error plain ESM script without type declarations
import { releaseNotes } from "../../scripts/changelog-notes.mjs";

const c = (subject: string, body = "", author = "Dev <dev@example.com>") => ({
  subject,
  body,
  author,
});

describe("releaseNotes", () => {
  it("groups releasable commits, oldest first, and leaves out the rest", () => {
    // Newest first, as git lists them.
    const commits = [
      c("fix: second fix (#4)"),
      c("fix(deps): update dependency foo"),
      c("docs: words"),
      c("feat(ui): add a thing (#2)"),
      c("fix: first fix"),
      c("perf: faster"),
    ];

    expect(releaseNotes("1.1.0", commits)).toBe(
      [
        "## 1.1.0",
        "### New Features\n\n- **ui:** add a thing",
        "### Bug Fixes\n\n- first fix\n- second fix",
        "### Performance\n\n- faster",
      ].join("\n\n"),
    );
  });

  it("lists breaking changes with their footer", () => {
    expect(releaseNotes("2.0.0", [c("feat!: drop v13", "BREAKING CHANGE: needs\nv14")])).toBe(
      "## 2.0.0\n\n### Breaking Changes\n\n- drop v13\n  - needs v14",
    );
  });

  it("escapes markup", () => {
    expect(releaseNotes("1.0.1", [c("fix: keep <b> & some_name")])).toContain(
      "- keep &lt;b> &amp; some\\_name",
    );
  });
});

describe("addSection", () => {
  it("creates the file", () => {
    expect(addSection("", "## 1.0.0\n\n- one")).toBe("# Changelog\n\n## 1.0.0\n\n- one\n");
  });

  it("prepends, replacing a section of the same version", () => {
    const file = "# Changelog\n\n## 1.1.0\n\n- stale\n\n## 1.0.0\n\n- one\n";

    expect(addSection(file, "## 1.1.0\n\n- two")).toBe(
      "# Changelog\n\n## 1.1.0\n\n- two\n\n## 1.0.0\n\n- one\n",
    );
  });
});
