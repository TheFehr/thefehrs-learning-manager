import { expect, Page } from "@playwright/test";

export async function switchTab(page: Page, tabName: string) {
  const tabHeading = page.getByRole("heading", { name: tabName });
  await tabHeading.click();
  await expect(tabHeading).toContainClass("active");
}

export async function disableTour(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "core.tourProgress",
      JSON.stringify({ core: { backupsOverview: 0 } }),
    );
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
    const dialog = page.locator("dialog.dialog").filter({ hasText: `Delete World: ${worldId}` });
    await expect(dialog).toBeVisible();

    const confirmCode = await dialog.locator("#confirm-code .reference").innerText();
    await dialog.locator("#delete-confirm").fill(confirmCode);

    // Click "Yes" to confirm
    await dialog.getByRole("button", { name: "Yes" }).click();

    await expect(worldBox).toBeHidden();
  }
}
