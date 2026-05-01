import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    conditions: ["browser", "module", "development", "production"],
  },
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "happy-dom",
    exclude: ["node_modules", "dist", ".idea", ".git", ".cache", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        lines: 75,
        functions: 65,
        branches: 60,
        statements: 75,
      },
    },
  },
});
