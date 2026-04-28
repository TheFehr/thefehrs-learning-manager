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

    await page.waitForTimeout(1000);

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
