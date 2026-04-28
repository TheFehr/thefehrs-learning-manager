import { test as base } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    page.on("console", (msg) => {
      if (msg.type() === "warning" && msg.text().includes("deprecated")) {
        // We throw an error to fail the test when a deprecation warning is detected
        console.error(`Deprecation warning detected in browser console: ${msg.text()}`);
        throw new Error(`Deprecation detected: ${msg.text()}`);
      }
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";
