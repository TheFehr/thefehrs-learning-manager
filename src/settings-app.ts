import { Settings } from "./settings";
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

  protected override _onRender(context: any, options: any) {
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
