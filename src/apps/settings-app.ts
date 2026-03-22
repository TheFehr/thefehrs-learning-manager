import SettingsConfig from "./SettingsConfig.svelte";
import { mount, unmount } from "svelte";

const { ApplicationV2 } = foundry.applications.api;

export class LearningConfigApp extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: "learning-config-app",
    tag: "div",
    window: { title: "Downtime Engine Configuration", width: 750, resizable: true },
    position: { height: 600 },
  };

  private svelteInstance: Record<string, unknown> | null = null;

  protected override async _renderHTML(context: unknown, options: unknown): Promise<string> {
    return ""; // Svelte handles the DOM
  }

  protected override _replaceHTML(result: string, content: HTMLElement, options: unknown): void {
    // No-op, Svelte handles the content
  }

  protected override async _onRender(context: unknown, options: unknown) {
    const target = this.element.querySelector(".window-content") || this.element;

    if (this.svelteInstance) {
      unmount(this.svelteInstance);
    }

    this.svelteInstance = mount(SettingsConfig, {
      target: target,
      props: {},
    });
  }

  override async close(options: object = {}) {
    if (this.svelteInstance) {
      unmount(this.svelteInstance);
      this.svelteInstance = null;
    }
    return super.close(options);
  }
}
