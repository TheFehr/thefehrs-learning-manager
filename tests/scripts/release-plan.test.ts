import { describe, it, expect } from "vitest";
// @ts-expect-error plain ESM script without type declarations
import { bumpVersion, classifyCommit, planRelease } from "../../scripts/release-plan.mjs";

const human = "Dev <dev@example.com>";
const renovate = "renovate[bot] <1+renovate[bot]@users.noreply.github.com>";
const c = (subject: string, body = "", author = human) => ({ subject, body, author });

describe("classifyCommit", () => {
  it.each([
    ["feat: add a thing", "minor"],
    ["feat(ui): add a thing (#1)", "minor"],
    ["fix: repair", "patch"],
    ["perf: faster", "patch"],
    ["feat!: drop v13", "major"],
    ["fix(api)!: change shape", "major"],
    ["docs: words", null],
    ["chore: tidy", null],
    ["ci: pipeline", null],
    ["test(e2e): more", null],
    ["not conventional", null],
  ])("%s -> %s", (subject, expected) => {
    expect(classifyCommit(c(subject))).toBe(expected);
  });

  it("treats a BREAKING CHANGE footer as major", () => {
    expect(classifyCommit(c("fix: x", "details\n\nBREAKING CHANGE: gone"))).toBe("major");
  });

  it("does not release for a breaking marker on a non-releasable type", () => {
    expect(classifyCommit(c("chore!: drop a script"))).toBeNull();
    expect(classifyCommit(c("docs: x", "BREAKING CHANGE: words"))).toBeNull();
    expect(planRelease({ commits: [c("fix: a"), c("ci!: b")], currentVersion: "1.0.0" }).kind).toBe(
      "patch",
    );
  });

  it("ignores dependency updates by scope and by bot author", () => {
    expect(classifyCommit(c("fix(deps): update dependency foo"))).toBeNull();
    expect(classifyCommit(c("chore(deps-dev): bump"))).toBeNull();
    expect(classifyCommit(c("fix: from a bot", "", renovate))).toBeNull();
    expect(
      classifyCommit(c("feat: submodules", "", "bot <1+thefehr-automation-bot[bot]@x>")),
    ).toBeNull();
  });
});

describe("planRelease", () => {
  it("does not release for dependency-only history", () => {
    const plan = planRelease({
      commits: [c("chore(deps): a", "", renovate), c("chore: update submodules", "", renovate)],
      currentVersion: "8.2.0",
    });
    expect(plan).toMatchObject({ release: false, version: "8.2.0" });
  });

  it("does not release for non-releasable human commits alone", () => {
    const plan = planRelease({ commits: [c("docs: x"), c("ci: y")], currentVersion: "8.2.0" });
    expect(plan.release).toBe(false);
  });

  it("takes the highest bump among releasable commits", () => {
    const plan = planRelease({
      commits: [c("fix: a"), c("docs: b"), c("feat: c"), c("chore(deps): d", "", renovate)],
      currentVersion: "8.2.0",
    });
    expect(plan).toEqual({ release: true, kind: "minor", version: "8.3.0", releasable: 2 });
  });

  it("bumps major and resets lower parts", () => {
    expect(planRelease({ commits: [c("feat!: x")], currentVersion: "8.2.5" }).version).toBe(
      "9.0.0",
    );
  });

  it("bumps patch", () => {
    expect(planRelease({ commits: [c("fix: x")], currentVersion: "8.2.5" }).version).toBe("8.2.6");
  });
});

describe("bumpVersion", () => {
  it("bumps each kind", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });
});
