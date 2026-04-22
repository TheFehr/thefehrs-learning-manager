import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// Read from ".env" file.
dotenv.config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: false, // For Foundry tests, we usually want sequential to avoid world locking
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.FOUNDRY_URL || "http://localhost:30000",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "teardown",
      testMatch: /global-teardown\.ts/,
      use: {
        storageState: "e2e/.auth/user.json",
      },
    },
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
      teardown: "teardown",
      use: {
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
        viewport: { width: 1920, height: 1080 },
      },
      dependencies: ["setup"],
    },
  ],
});
