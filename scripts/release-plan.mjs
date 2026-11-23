#!/usr/bin/env node
// Decides whether a release is due and which version it carries, from the
// conventional commits merged since the last tag.
//
//   feat                  -> minor
//   fix, perf             -> patch
//   "!" or BREAKING CHANGE -> major
//
// Dependency updates never count: not commits by a bot, not (deps)/(deps-dev)
// scoped ones. Any other type (docs, chore, ci, test, ...) does not trigger a
// release on its own and cannot raise the bump above what releasable commits set.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { CommitParser } from "conventional-commits-parser";

const RANK = { patch: 1, minor: 2, major: 3 };
const BUMP_BY_TYPE = { feat: "minor", fix: "patch", perf: "patch" };
const parser = new CommitParser({
  headerPattern: /^(\w*)(?:\(([^)]*)\))?(!)?: (.*)$/,
  headerCorrespondence: ["type", "scope", "breaking", "subject"],
  noteKeywords: ["BREAKING CHANGE", "BREAKING-CHANGE"],
});

export function isDependencyCommit({ author, subject }) {
  if (/\[bot\]|renovate/i.test(author)) return true;
  const scope = parser.parse(subject).scope?.toLowerCase();
  return scope === "deps" || scope === "deps-dev";
}

// Returns "major" | "minor" | "patch", or null when the commit is not releasable.
export function classifyCommit(commit) {
  if (isDependencyCommit(commit)) return null;
  const parsed = parser.parse(`${commit.subject}\n\n${commit.body ?? ""}`);
  if (!parsed.type) return null;
  if (parsed.breaking || parsed.notes.length > 0) return "major";
  return BUMP_BY_TYPE[parsed.type.toLowerCase()] ?? null;
}

export function bumpVersion(version, kind) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function planRelease({ commits, currentVersion }) {
  let kind = null;
  let releasable = 0;
  for (const commit of commits) {
    const bump = classifyCommit(commit);
    if (!bump) continue;
    releasable++;
    if (!kind || RANK[bump] > RANK[kind]) kind = bump;
  }
  if (!kind) return { release: false, kind: null, version: currentVersion, releasable: 0 };
  return { release: true, kind, version: bumpVersion(currentVersion, kind), releasable };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function lastTag() {
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*");
  } catch {
    return "";
  }
}

function readCommits(since) {
  const range = since ? [`${since}..HEAD`] : [];
  const raw = git("log", "--no-merges", "--format=%x1e%ae%x1f%an%x1f%s%x1f%b", ...range);
  return raw
    .split("\x1e")
    .filter(Boolean)
    .map((entry) => {
      const [email, name, subject, body] = entry.split("\x1f");
      return { author: `${name} <${email}>`, subject: subject.trim(), body: body ?? "" };
    });
}

function main() {
  const tag = lastTag();
  if (!tag) {
    console.error("No v* tag found: refusing to plan a release without a baseline.");
    process.exit(1);
  }
  const plan = planRelease({ commits: readCommits(tag), currentVersion: tag.slice(1) });
  console.log(JSON.stringify({ ...plan, lastTag: tag }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
