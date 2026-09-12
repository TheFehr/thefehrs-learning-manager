import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Read from ".env" file.
dotenv.config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 900000,
  expect: {
    timeout: 30000,
  },
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    [
      "html",
      { open: "never", outputFolder: process.env.PLAYWRIGHT_HTML_REPORT || "playwright-report" },
    ],
  ],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || "test-results",

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: process.env.FOUNDRY_URL || "http://localhost:30000",
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 120000,
    navigationTimeout: 120000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Without an explicit executablePath (the Docker-based e2e runner
        // has none - the browser is Microsoft's playwright image's own
        // bundled binary now, not a host install) and no channel set,
        // Playwright's own default for headless runs is the separate,
        // more minimal chromium_headless_shell binary, not full desktop
        // Chromium - confirmed directly (process list showed
        // chrome-headless-shell during VM debugging). For a canvas/WebGL-
        // heavy app like Foundry (PixiJS rendering, drag-and-drop onto the
        // canvas), that's a real behavioral difference worth pinning
        // down, not an incidental one - force full Chromium explicitly so
        // this doesn't silently vary with whether executablePath happens
        // to be set.
        channel: "chromium",
        viewport: { width: 1920, height: 1080 },
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    },
  ],
});
