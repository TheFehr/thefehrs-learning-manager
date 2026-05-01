import { expect, Page } from "@playwright/test";

export async function switchTab(page: Page, tabName: string) {
  const tabHeading = page.getByRole("heading", { name: tabName });
  await tabHeading.click();
  await expect(tabHeading).toContainClass("active");
}

export async function disableTour(page: Page) {
  await page.addInitScript(() => {
    // Disable core tours in localStorage
    const tourProgress = {
      core: {
        backupsOverview: 1,
        welcome: 1,
        setup: 1,
      },
    };
    window.localStorage.setItem("core.tourProgress", JSON.stringify(tourProgress));

    // Forcefully hide any tour overlays via CSS
    const style = document.createElement("style");
    style.id = "gemini-disable-tour-style";
    style.innerHTML = `
      .tour-overlay, 
      #tour-overlay, 
      .joyride-overlay, 
      .foundry-tour-overlay { 
        display: none !important; 
        pointer-events: none !important; 
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  });
}

export async function deleteWorldIfExists(page: Page, worldId: string) {
  await switchTab(page, "Game Worlds");
  // Use a more specific selector to avoid matching notifications or other list items
  const worldBox = page.locator(`li.package.world[data-package-id="${worldId}"]`);

  if ((await worldBox.count()) === 1) {
    // If the world is active, stop it first
    const stopButton = worldBox.locator('[data-action="worldStop"]');
    if ((await stopButton.count()) === 1 && (await stopButton.isVisible())) {
      await stopButton.click();
      // Wait for the stop button to disappear and launch button to appear
      await expect(worldBox.locator('[data-action="worldLaunch"]')).toBeVisible();
    }

    // Right-click to open context menu
    await worldBox.click({ button: "right" });

    // Click "Delete World" in the context menu
    const deleteOption = page.locator(".context-item").filter({ hasText: "Delete World" });
    await deleteOption.click();

    // Handle the confirmation dialog with the random code
    const dialog = page
      .locator("dialog,div,section,form")
      .filter({ has: page.getByRole("heading", { name: `Delete World: ${worldId}` }) })
      .last();
    await expect(dialog).toBeVisible();

    const confirmCode = await dialog.locator(".reference").innerText();
    await dialog.getByRole("textbox").fill(confirmCode);

    // Click "Yes" to confirm
    await dialog.getByRole("button", { name: "Yes" }).click();

    await expect(worldBox).toBeHidden();
  }
}

export async function returnToSetup(page: Page, adminPassword?: string) {
  const currentUrl = page.url();

  if (currentUrl.includes("/setup")) {
    return;
  }

  if (currentUrl.includes("/game")) {
    // Open Settings sidebar
    await page.getByRole("tab", { name: "Game Settings" }).click();
    // Click Return to Setup
    const returnToSetupButton = page.locator('button[data-app="setup"]');
    await returnToSetupButton.click();

    // Handle confirmation dialog if it appears
    const confirmButton = page.locator("button.yes, button.default").filter({ hasText: /Yes/i });
    try {
      await confirmButton.waitFor({ state: "visible", timeout: 2000 });
      await confirmButton.click();
    } catch (e) {
      // Dialog might not have appeared
    }
  } else if (currentUrl.includes("/join")) {
    const returnToSetupButton = page.getByRole("button", { name: /Return to Setup/i });
    try {
      await returnToSetupButton.waitFor({ state: "visible", timeout: 5000 });
      const adminPasswordInput = page
        .locator('input[name="adminPassword"], input[type="password"]')
        .last();
      if ((await adminPasswordInput.isVisible()) && adminPassword) {
        await adminPasswordInput.fill(adminPassword);
      }
      await returnToSetupButton.click();
    } catch (e) {
      // Button might not be present if no admin password is set or already at setup
    }
  }

  // Wait for /setup or /auth
  await page.waitForURL(
    (url) => url.pathname.includes("/setup") || url.pathname.includes("/auth"),
    { timeout: 30000 },
  );

  if (page.url().includes("/auth")) {
    const passwordInput = page.locator('input[name="adminPassword"]');
    if ((await passwordInput.isVisible()) && adminPassword) {
      await passwordInput.fill(adminPassword);
      await page.getByRole("button", { name: "Log In" }).click();
      await page.waitForURL((url) => url.pathname.includes("/setup"), { timeout: 30000 });
    }
  }
}
