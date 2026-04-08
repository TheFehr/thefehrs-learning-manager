import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  resolve: {
    conditions: ["browser", "module", "development", "production"],
  },
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "happy-dom",
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
