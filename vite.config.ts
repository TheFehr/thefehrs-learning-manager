import { defineConfig } from "vite";
import foundry from "vite-plugin-fvtt";

export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: "main",
    },
    emptyOutDir: true,
    sourcemap: true,
  },
  plugins: [foundry()],
});
