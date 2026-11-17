// Single source of truth for the dnd5e / Tidy5e versions the Foundry 14 e2e
// world runs against: whatever the submodules in externals/ are checked out at.
// The submodule-releases workflow moves them together as a compatible pair, so a
// bump there is automatically a bump of what e2e tests with.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

export function readPins(root = process.cwd()) {
  const systemJson = path.join(root, "externals", "dnd5e", "system.json");
  if (!fs.existsSync(systemJson)) {
    throw new Error(
      "externals/dnd5e is not checked out. Run `git submodule update --init --recursive`.",
    );
  }
  const dnd5e = JSON.parse(fs.readFileSync(systemJson, "utf8")).version;

  // Tidy5e's own module.json carries a placeholder version, so the release tag the
  // submodule is pinned to is the only reliable source.
  let tag;
  try {
    tag = execFileSync(
      "git",
      ["-C", path.join(root, "externals", "tidy-5e"), "describe", "--tags", "--exact-match"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  } catch (error) {
    throw new Error(
      `externals/tidy-5e is not checked out at a release tag (${error.message.trim()}). Run \`git submodule update --init --recursive\`.`,
    );
  }
  const match = /^v(\d+\.\d+\.\d+)$/.exec(tag);
  if (!match) throw new Error(`externals/tidy-5e is at "${tag}", expected a vX.Y.Z release tag.`);

  return { dnd5e, tidy5e: match[1] };
}

// Downloads a release zip and unpacks it into destDir. Uses the release's own
// asset URL rather than Foundry's manifest install: Tidy5e's release manifests
// point their `manifest` field at "latest", so installing "v14.4.2" by manifest
// silently installed whatever was newest.
export async function seedZip(url, destDir) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  fs.mkdirSync(destDir, { recursive: true });
  const zipPath = path.join(destDir, ".download.zip");
  fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  try {
    try {
      execFileSync("unzip", ["-q", "-o", zipPath, "-d", destDir]);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      execFileSync("python3", ["-m", "zipfile", "-e", zipPath, destDir]);
    }
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
}
