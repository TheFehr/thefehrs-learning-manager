import { defineConfig } from "vite";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";

const MODULE_ID = "thefehrs-learning-manager";
const BASE_PATH = `/modules/${MODULE_ID}/`;
const FOUNDRY_URL = "http://localhost:30000";

export default defineConfig({
  base: BASE_PATH,

  // 1. Define the global variable the plugin used to provide
  define: {
    __FVTT_PLUGIN__: {
      id: MODULE_ID,
      isSystem: false,
    },
  },

  build: {
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: "main",
    },
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
        assetFileNames: (asset) => (asset.name?.endsWith(".css") ? "main.css" : "[name][extname]"),
      },
    },
    emptyOutDir: true,
    sourcemap: true,
  },

  server: {
    port: 30001,
    proxy: {
      // Proxy everything EXCEPT your module assets to the real Foundry
      [`^(?!${BASE_PATH})`]: {
        target: FOUNDRY_URL,
        ws: true,
      },
    },
  },

  plugins: [
    svelte({
      preprocess: vitePreprocess(),
    }),

    // 2. Custom "Foundry Dev" plugin to fix the 404
    {
      name: "foundry-dev-mapping",
      // In dev mode, when main.js is requested, serve src/main.ts instead
      resolveId(id) {
        if (id === `${BASE_PATH}main.js` || id === "/main.js") {
          return path.resolve(__dirname, "src/main.ts");
        }
      },
    },
  ],
});
