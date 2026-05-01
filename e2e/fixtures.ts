import { test as base } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    page.on("console", (msg) => {
      const text = msg.text();
      const type = msg.type();

      // Ignore known harmless warnings
      if (text.includes("hardware acceleration")) return;
      if (text.includes("Skipping game canvas")) return;
      if (text.includes("Buffered socket event")) return;
      // Vite dev server noise
      if (text.includes("[vite]")) return;

      if (type === "error") {
        // We log errors but don't fail immediately because Foundry often has benign 404s for assets
        console.error(`Browser Error: ${text}`);
      }

      if (type === "warning") {
        // Fail on any deprecation or migration errors we've seen before
        if (
          text.includes("deprecated") ||
          text.includes("Cannot read properties of null") ||
          text.includes("Failed data migration")
        ) {
          console.error(`CRITICAL WARNING detected in browser console: ${text}`);
          throw new Error(`Critical Warning: ${text}`);
        }

        // Log other warnings to host console for visibility
        console.warn(`Browser Warning: ${text}`);
      }
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";
