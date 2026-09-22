import { expect, type Page, type Locator, type BrowserContext } from "@playwright/test";

/**
 * Waits until the Foundry game is fully initialized — game.ready is true AND all core
 * document collections (items, packs, actors) are available. Use this at the start of
 * setupWorld callbacks to guard against the race condition where foundrySetup returns
 * while the page is still mid-reload after module activation.
 */
export async function waitForGameReady(page: Page) {
  // foundrySetup may leave the page at /join after module activation reloads the page.
  // If so, log in as Gamemaster before polling for full game state.
  const url = page.url();
  if (!url.includes("/game")) {
    if (!url.includes("/join")) {
      await page.goto("/join");
    }
    await page.waitForSelector('select[name="userid"], input[name="password"]', { timeout: 30000 });
    const userSelect = page.locator('select[name="userid"]');
    if (await userSelect.isVisible()) {
      await userSelect.selectOption({ label: "Gamemaster" });
    }
    await page.locator('button[name="join"]').click({ force: true });
    await page.waitForURL(/\/game/, { timeout: 60000 });
  }
  await page.waitForFunction(
    () => {
      const w = window as any;
      return (
        w.game?.ready === true &&
        w.game?.items !== undefined &&
        w.game?.packs !== undefined &&
        typeof w.Actor?.create === "function" &&
        typeof w.Item?.create === "function"
      );
    },
    { timeout: 60000 },
  );
}

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

// A GM dropping an eligible item onto a PC's sheet now gets prompted for a
// starting progress (or to mark the project already complete) instead of
// always silently starting at 0 - every e2e spec that drops a project item
// runs as the Gamemaster user, so every one of them now hits this dialog.
// Defaults to confirming with no changes (starting progress 0, not marked
// complete), matching the pre-dialog behavior those specs were written
// against - pass options to exercise the other paths explicitly.
export async function confirmInitiateProjectDialog(
  page: Page,
  options: { progress?: number; markComplete?: boolean } = {},
) {
  const dialog = page
    .locator(".window-app, .application")
    .filter({ hasText: "Add Project" })
    .first();
  await expect(dialog).toBeVisible({ timeout: 10000 });

  if (options.progress !== undefined) {
    // Svelte's bind:value listens for the input's own "input" event -
    // Locator.fill() doesn't reliably deliver one on every browser/input
    // combination (matches the same established caveat this file's other
    // onchange-bound inputs work around, just for Svelte's own two-way
    // binding instead of a manual event handler). The dialog's own content
    // mounts asynchronously (DialogV2 only attaches config.content once its
    // own render() resolves - see promptInitiateProject's comment), so
    // confirm the value actually landed rather than a one-shot set: a
    // locator resolving to the input doesn't guarantee Svelte's own
    // reactive wiring has settled yet.
    const progressInput = dialog.locator(".initiate-progress-input");
    await progressInput.evaluate((el: HTMLInputElement, value: string) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, String(options.progress));
    await expect(progressInput).toHaveValue(String(options.progress), { timeout: 5000 });
  }
  const completeCheckbox = dialog.locator(".initiate-mark-complete");
  if (options.markComplete) {
    await forceClick(completeCheckbox);
    await expect(completeCheckbox).toBeChecked({ timeout: 5000 });
  } else {
    // Explicit, not just an absence of interaction: confirms the box is
    // genuinely unchecked before submitting, so a stray checked default
    // (getValues() forces progress to target when this is true) fails loud
    // and points straight at the checkbox instead of surfacing as a
    // confusing wrong-progress assertion several steps later.
    await expect(completeCheckbox).not.toBeChecked({ timeout: 5000 });
  }

  await forceClick(dialog.getByRole("button", { name: /^Add$/i }));
  await expect(dialog).toBeHidden({ timeout: 10000 });
}

// Screenshots land under e2e/screenshots/, committed to the repo (each
// verify run overwrites them in place) rather than under test-results-*/,
// which is git-ignored and wiped per run - the point here is an
// auto-updating record of what the UI actually looks like, not a
// per-run debugging artifact.
//
// Deliberately no fullPage option: pass a Locator scoped to the specific
// window/dialog being documented (e.g. the settings app, not the whole
// page) rather than defaulting to a full-page capture. Foundry's own UI
// is a fixed-viewport app with floating windows, not a scrolling
// document, so "full page" would just capture the whole canvas/sidebar
// around the thing actually worth showing, not the thing itself.
export async function snapshot(target: Page | Locator, name: string) {
  // disableTour() (called in every spec's setupWorld) does not reliably
  // suppress every Foundry tour - confirmed live: a "Welcome to Foundry
  // Virtual Tabletop" tour still rendered mid-test and ruined a screenshot
  // despite it. This repo also has its own unused setupTourKiller/
  // addTourKillerStyle helpers below with a different, likely-also-wrong
  // guess at the tourProgress storage shape, and selectors that stop at
  // ".tour-v13" with nothing for v14 - rather than trying to fix tour
  // suppression itself here, just brute-force-clear anything tour-shaped
  // right before every capture so screenshots are reliable regardless.
  const page = "page" in target ? target.page() : target;
  const sweepOverlays = () =>
    page.evaluate(() => {
      document.querySelectorAll('[class*="tour" i], [id*="tour" i]').forEach((el) => el.remove());
      // Foundry's own persistent notification banners (e.g. a hardware-
      // acceleration warning in this headless/software-rendered chromium)
      // pin to the top of the viewport and bleed into every capture -
      // same #notifications container clearFoundryOverlays already knew
      // about, just never actually called from any spec until now.
      document.querySelectorAll("#notifications .notification").forEach((el) => el.remove());
    });

  // A tour (or, less commonly, a notification) can render on a short delay
  // after a UI action (confirmed live for tours: reliably absent
  // immediately after a tab switch, present moments later) rather than
  // being there to sweep immediately - so sweep, give a delayed trigger a
  // window to fire, then sweep again right before capturing.
  await sweepOverlays();
  await page.waitForTimeout(500);
  await sweepOverlays();
  // CSS transitions (e.g. a progress bar's width transition) can otherwise
  // get captured mid-animation, producing a slightly different image on an
  // otherwise-identical run - animations: "disabled" freezes them to their
  // end state for just this capture, so byte differences between runs
  // actually mean something changed instead of being timing noise.
  await target.screenshot({ path: `e2e/screenshots/${name}.png`, animations: "disabled" });
}

// Foundry's default "no active scene" canvas backdrop (the FVTT/d20
// watermark) sits behind every app window's translucent chrome, and its own
// rendering carries real byte-level noise between otherwise-identical runs
// (confirmed live: same test run 5x back-to-back produced 5 different
// screenshot hashes, up to a 9/255 channel diff on ~0.25% of pixels,
// concentrated on the watermark itself - not a compression or animation
// artifact, since animations: "disabled" in snapshot() already rules that
// out). Activating a scene with no background image replaces that watermark
// with a flat canvas, which eliminates the noise (confirmed live: 5
// back-to-back runs with this active produced byte-identical screenshots).
// Call this from setupWorld, alongside disableTour(), in any spec that
// takes screenshots - it's a no-op past the first call since the scene
// persists in the world's base backup.
export async function activateBlankScene(page: Page) {
  await page.evaluate(async () => {
    const scenes = (game as any).scenes;
    const scene =
      scenes.getName("E2E Blank") ??
      (await (Scene as any).create({ name: "E2E Blank", background: { src: null } }));
    if (!scene.active) await scene.activate();
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
