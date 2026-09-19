import { Logger } from "./logger.js";
import { FoundryUtils } from "./foundry-utils.js";

export class ProjectUI {
  static generateProgressHtml(progress: number, target: number, tutelageName: string): string {
    const p = Number.isFinite(progress) ? Math.max(0, progress) : 0;
    const t = Number.isFinite(target) ? Math.max(0, target) : 0;
    const pLabel = Number.isFinite(progress) ? p : "—";
    const tLabel = Number.isFinite(target) ? t : "—";
    const escapedTutelageName = FoundryUtils.escapeHTML(tutelageName);
    const percentage = t > 0 ? Math.min(100, Math.max(0, (p / t) * 100)) : 0;
    // Bar fill and label overlay mirror dnd5e's own .meter/.meter.progress/
    // .label convention (e.g. the HP meter): a dark track (gold border,
    // inset shadow) rather than a bright fill color, a gradient that shifts
    // from blue toward maroon as it fills, an inset highlight for depth,
    // and the current/max text overlaid directly on the bar with a
    // text-shadow for legibility, rather than a separate line above a
    // flat-color bar. --dnd5e-color-faint (a light beige) looked like a
    // bright, out-of-place pill against a dark sheet theme - dnd5e's own
    // dark-mode meters use --dnd5e-color-light-gray for the track instead
    // (confusingly named - it's only "light" relative to
    // --dnd5e-color-dark-gray, both are near-black). Built with inline
    // styles only (no <style> tag) since this is injected into an item's
    // rich-text description, not a component with its own stylesheet - the
    // --dnd5e-* custom properties it references are defined at :root by the
    // system, so they're available here regardless.
    return `<!-- learning-manager:progress-start -->
<div class="learning-manager-progress-container" style="margin: 0.5rem 0 1rem 0; padding: 0.5rem; border: 1px solid var(--t5e-faint-color); border-radius: 4px; background: var(--t5e-background); font-family: var(--t5e-font-family);">
  <div style="box-sizing: border-box; position: relative; width: 100%; height: 20px; border: 1px solid var(--dnd5e-color-gold, #9f9275); border-radius: 2px; box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.25); overflow: hidden; background: var(--dnd5e-color-light-gray, #3d3d3d);">
    <div style="--bar-color-2: color-mix(in oklab, var(--dnd5e-color-blue, cornflowerblue), var(--dnd5e-color-maroon, #741b2b) ${percentage}%); --bar-color-1: color-mix(in oklab, var(--bar-color-2), black 33%); position: absolute; inset: 0; width: ${percentage}%; background: linear-gradient(to right, var(--bar-color-1), var(--bar-color-2)); box-shadow: inset 0 1px 0 1px var(--dnd5e-highlight-40, rgba(255, 255, 255, 0.2)); transition: width 0.4s ease-in-out;"></div>
    <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 8px; font-weight: bold; font-size: 0.75rem; color: var(--color-text-light-0, #fff); text-shadow: 0 0 4px var(--dnd5e-color-gold, #9f9275); pointer-events: none;">
      <span>Training Progress (${escapedTutelageName})</span>
      <span>${pLabel} / ${tLabel}</span>
    </div>
  </div>
</div>
<!-- learning-manager:progress-end -->`;
  }

  static stripProgressHtml(html: string): string {
    if (!html) return "";

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");

      const containers = doc.querySelectorAll(".learning-manager-progress-container");
      containers.forEach((c) => c.remove());

      const wrapper = doc.body.firstElementChild;
      let clean = wrapper ? wrapper.innerHTML : html;
      clean = clean.replace(
        /<!-- learning-manager:progress-start -->[\s\S]*?<!-- learning-manager:progress-end -->/g,
        "",
      );

      return clean.trim();
    } catch (err) {
      Logger.error("Failed to parse HTML for stripping:", true, err);
      return html
        .replace(
          /<!-- learning-manager:progress-start -->[\s\S]*?<!-- learning-manager:progress-end -->/g,
          "",
        )
        .trim();
    }
  }
}
