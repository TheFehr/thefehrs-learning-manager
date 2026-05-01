import { test as setup, expect } from "./fixtures";
import { disableTour } from "./helpers";
import fs from "fs";
import path from "path";

setup("authenticate as player", async ({ page, baseURL }) => {
  setup.setTimeout(180000);

  const worldId = process.env.FOUNDRY_E2E_WORLD;
  const userName = "Test Player";
  const password = "password";

  const authFile = "e2e/.auth/player.json";
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  await disableTour(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // If we are at setup, we need to go to join
  if (page.url().includes("/setup")) {
    // This shouldn't happen if we just launched the world, but if it does, we need to join
    await page.goto(`/join`);
  }

  await page.waitForURL((url) => url.pathname.includes("/join"), { timeout: 60000 });

  console.log(`Logging into world as "${userName}"...`);
  await page.locator('select[name="userid"]').selectOption({ label: userName });
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[name="join"]').click();

  await page.waitForURL(/\/game/, { timeout: 60000 });
  await expect(page.locator("#loading")).toBeHidden({ timeout: 60000 });
  await page.waitForFunction(() => typeof (game as any) !== "undefined" && (game as any).ready, {
    timeout: 60000,
  });

  console.log("Player setup complete. Saving storage state.");
  await page.context().storageState({ path: authFile });
});
