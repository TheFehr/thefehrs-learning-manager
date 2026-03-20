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

  private svelteInstance: any = null;

  protected override async _renderHTML(context: any, options: any): Promise<any> {
    return ""; // Svelte handles the DOM
  }

  protected override _replaceHTML(result: any, content: HTMLElement, options: any): void {
    // No-op, Svelte handles the content
  }

  protected override async _onRender(context, options) {
    const target = this.element.querySelector(".window-content") || this.element;

    if (this.svelteInstance) {
      unmount(this.svelteInstance);
    }

    this.svelteInstance = mount(SettingsConfig, {
      target: target,
      props: {},
    });
  }

  override async close(options: any = {}) {
    if (this.svelteInstance) {
      unmount(this.svelteInstance);
      this.svelteInstance = null;
    }
    return super.close(options);
  }
}
