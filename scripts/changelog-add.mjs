#!/usr/bin/env node
// Prepends the release notes read from stdin (see changelog-notes.mjs) to public/CHANGELOG.md,
// which ships with the module and is shown in Foundry by the "thefehrs-changelog" module.
// Kept free of dependencies: it runs in the release job, which installs none.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FILE = "public/CHANGELOG.md";
const TITLE = "# Changelog";

/** Puts a section above the earlier ones, replacing an earlier section of the same version. */
export function addSection(changelog, section) {
  const heading = section.split("\n", 1)[0].trim();
  const earlier = changelog
    .split(/^(?=## )/m)
    .filter((part) => part.startsWith("## ") && part.split("\n", 1)[0].trim() !== heading);
  return `${[TITLE, section, ...earlier].map((part) => part.trim()).join("\n\n")}\n`;
}

function main() {
  const section = readFileSync(0, "utf8").trim();
  if (!section.startsWith("## ")) throw new Error("Expected a version section on stdin.");
  let changelog = "";
  try {
    changelog = readFileSync(FILE, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  writeFileSync(FILE, addSection(changelog, section));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
