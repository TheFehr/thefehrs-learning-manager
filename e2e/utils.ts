import { expect, type Page, type BrowserContext } from "@playwright/test";

/**
 * Injects a script that aggressively kills Foundry VTT tours and overlays
 * as soon as they appear.
 */
export async function setupTourKiller(context: BrowserContext) {
  await context.addInitScript(() => {
    // 1. Force settings in localStorage before anything loads
    localStorage.setItem(
      "core.tourProgress",
      JSON.stringify({ "core.welcome": { completed: true } }),
    );

    const kill = () => {
      // Mark as completed in settings
      // @ts-ignore
      if (typeof game !== "undefined" && game.settings && game.settings.ready) {
        try {
          // @ts-ignore
          const current = game.settings.get("core", "tourProgress") || {};
          if (!current["core.welcome"]?.completed) {
            // @ts-ignore
            game.settings.set("core", "tourProgress", {
              ...current,
              "core.welcome": { completed: true },
            });
          }
        } catch (e) {}

        // @ts-ignore
        if (game.tours) {
          // @ts-ignore
          for (let tour of game.tours) {
            if (tour.status !== "COMPLETED") tour.complete();
          }
        }
      }

      // Brutally remove DOM elements
      const selectors = [
        ".tour",
        ".tour-overlay",
        ".tour-center-step",
        ".tour-step-anchor",
        "aside.tour",
        ".tour-step",
        ".tour-step-v2",
        ".foundry-tour",
        ".tour-tooltip",
        "#foundry-tour",
        ".step-tooltip",
        ".tour-v2",
        ".tour-v13",
      ];
      selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => {
          (el as HTMLElement).remove();
        });
      });

      // Remove blocking classes
      if (document.body) {
        document.body.classList.remove("tour-open");
        document.body.classList.remove("tour-open-v2");
        document.body.classList.remove("tour-open-v13");
        document.body.style.pointerEvents = "auto";
      }
    };

    setInterval(kill, 50);
    const observer = new MutationObserver(kill);
    window.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  });
}

export async function addTourKillerStyle(page: Page) {
  await page.addStyleTag({
    content: `
          .tour, .tour-overlay, .tour-center-step, 
          .tour-step-anchor, aside.tour, .tour-step,
          .tour-step-v2, .foundry-tour, .tour-tooltip,
          #foundry-tour, .step-tooltip, .tour-v2, .tour-step-v2,
          .tour-v13, .v13-tour {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
            opacity: 0 !important;
            z-index: -1000 !important;
          }
          body.tour-open, body.tour-open-v2, body.tour-open-v13 {
            pointer-events: auto !important;
          }
          .window-app, .window-app *, .sheet, .sheet *, body, #ui-left, #ui-right, #ui-top, #ui-bottom {
              pointer-events: auto !important;
          }
          #notifications {
            display: none !important;
          }
        `,
  });
}

export async function clearFoundryOverlays(page: Page) {
  await addTourKillerStyle(page);
  await page.evaluate(() => {
    document.querySelectorAll("#notifications .notification").forEach((el) => el.remove());
  });
}

export async function forceClick(locator: any) {
  await locator.evaluate((el: HTMLElement) => {
    // Trigger both mousedown/up and click to be sure
    el.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }),
    );
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    el.click();
  });
}

export async function ensureEditMode(partyTab: any) {
  const toggleBtn = partyTab.locator(".toggle-progress-edit");
  const unlockIcon = toggleBtn.locator(".fa-unlock");

  await expect(async () => {
    const isUnlocked = await unlockIcon.isVisible();
    if (isUnlocked) return;

    // Ensure button is visible before clicking
    await expect(toggleBtn).toBeVisible({ timeout: 5000 });
    await forceClick(toggleBtn);
    await expect(unlockIcon).toBeVisible({ timeout: 5000 });
  }).toPass({ intervals: [1000], timeout: 40000 });
}
