export class ProjectUI {
  static generateProgressHtml(progress: number, target: number, tutelageName: string): string {
    const escapedTutelageName = foundry.utils.escapeHTML(tutelageName);
    const percentage = target > 0 ? Math.min(100, Math.max(0, (progress / target) * 100)) : 0;
    return `<!-- learning-manager:progress-start -->
<div class="learning-manager-progress-container" style="margin: 0.5rem 0 1rem 0; padding: 0.5rem; border: 1px solid var(--t5e-faint-color); border-radius: 4px; background: var(--t5e-background); font-family: var(--t5e-font-family);">
  <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 4px; font-size: 0.75rem; color: var(--t5e-secondary-color);">
    <span>Training Progress (${escapedTutelageName})</span>
    <span>${progress} / ${target}</span>
  </div>
  <div style="width: 100%; height: 12px; background: rgba(0,0,0,0.1); border-radius: 6px; overflow: hidden; position: relative;">
    <div style="width: ${percentage}%; height: 100%; background: var(--t5e-hp-bar-color, #4caf50); transition: width 0.4s ease-in-out;"></div>
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
      containers.forEach((c) => {
        if (c.parentNode) c.parentNode.removeChild(c);
      });

      const wrapper = doc.body.firstElementChild;
      let clean = wrapper ? wrapper.innerHTML : html;
      clean = clean.replace(
        /<!-- learning-manager:progress-start -->[\s\S]*?<!-- learning-manager:progress-end -->/g,
        "",
      );

      return clean.trim();
    } catch (err) {
      console.error("Downtime Engine | Failed to parse HTML for stripping:", err);
      return html
        .replace(
          /<!-- learning-manager:progress-start -->[\s\S]*?<!-- learning-manager:progress-end -->/g,
          "",
        )
        .trim();
    }
  }
}
