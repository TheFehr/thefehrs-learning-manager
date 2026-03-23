import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Orchestration script to generate external type definitions and ensure they don't break the build.
 */

async function main() {
  try {
    console.log("1. Extracting dnd5e types...");
    execSync("node scripts/load-dnd5e-types.mjs", { stdio: "inherit" });

    console.log("2. Generating dnd5e declarations (tsconfig.extract.json)...");
    try {
      execSync("npx tsc -p tsconfig.extract.json", { stdio: "inherit" });
    } catch (e) {
      console.warn("Foundry dnd5e tsc extraction reported some errors (expected), continuing...");
    }

    console.log("3. Generating Tidy5e declarations (tsconfig.tidy.json)...");
    try {
      execSync("npx tsc -p tsconfig.tidy.json", { stdio: "inherit" });
    } catch (e) {
      console.warn("Tidy5e tsc extraction reported some errors, continuing...");
    }

    console.log("4. Sanitizing and injecting // @ts-nocheck into all generated .d.ts and .d.mts files...");
    const dtsDir = "./external-dts";
    if (fs.existsSync(dtsDir)) {
      sanitizeAndNocheck(dtsDir);
    }

    console.log("\x1b[32m%s\x1b[0m", "Done! External types generated and sanitized.");
  } catch (err) {
    console.error("External type generation failed:", err);
    process.exit(1);
  }
}

function sanitizeAndNocheck(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      sanitizeAndNocheck(fullPath);
    } else if (entry.name.endsWith(".d.ts") || entry.name.endsWith(".d.mts")) {
      let content = fs.readFileSync(fullPath, "utf-8");
      
      // Fix syntax errors like ": number;" which happen on empty property names
      const originalContent = content;
      content = content.replace(/^(\s+):\s+number;/gm, "$1// [Sanitized]: number;");
      
      if (!content.includes("// @ts-nocheck")) {
        content = "// @ts-nocheck\n" + content;
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

main();
