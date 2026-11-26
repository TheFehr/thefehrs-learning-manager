#!/usr/bin/env node
// Prints the release notes of a version as a changelog section. It lists the same commits that
// make a release due (see release-plan.mjs).
//
//   changelog-notes.mjs <version> [since] [until]   since defaults to the last tag
import { pathToFileURL } from "node:url";
import { classifyCommit, lastTag, parseCommit, readCommits } from "./release-plan.mjs";

const HEADINGS = {
  major: "Breaking Changes",
  feat: "New Features",
  fix: "Bug Fixes",
  perf: "Performance",
};

// Commit messages are text, not markup.
function escape(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/([\\`*_[\]])/g, "\\$1");
}

export function releaseNotes(version, commits) {
  const groups = Object.fromEntries(Object.keys(HEADINGS).map((key) => [key, []]));

  for (const commit of commits) {
    const bump = classifyCommit(commit);
    if (!bump) continue;
    const { type, scope, subject, notes } = parseCommit(commit);
    // Without the pull request number that squash merging appends.
    const text = subject.replace(/\s*\(#\d+\)$/, "");
    const entry = `- ${scope ? `**${escape(scope)}:** ` : ""}${escape(text)}`;
    const details = notes.map((note) => `  - ${escape(note.text.replace(/\s+/g, " ").trim())}`);
    groups[bump === "major" ? "major" : type.toLowerCase()].push([entry, ...details].join("\n"));
  }

  const blocks = Object.entries(HEADINGS)
    .filter(([key]) => groups[key].length)
    // git lists the newest commit first.
    .map(([key, heading]) => `### ${heading}\n\n${groups[key].reverse().join("\n")}`);
  return [`## ${version}`, ...blocks].join("\n\n");
}

function main([version, since, until]) {
  if (!version) {
    console.error("Usage: changelog-notes.mjs <version> [since] [until]");
    process.exit(1);
  }
  console.log(releaseNotes(version, readCommits(since ?? lastTag(), until)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
