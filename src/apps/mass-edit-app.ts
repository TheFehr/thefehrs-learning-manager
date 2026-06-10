import MassEditUI from "./mass-edit/MassEditUI.svelte";
import { mount, unmount } from "svelte";

const { ApplicationV2 } = foundry.applications.api;

export class MassEditApp extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    tag: "div",
    window: {
      title: "Learning Manager: Mass Edit",
      icon: "fas fa-table-list",
      resizable: true,
      contentClasses: ["thefehrs-learning-manager-app"],
    },
    position: {
      width: 900,
      height: 700,
    },
  };

  private svelteInstance: any = null;

  protected override async _renderHTML(_context: object, _options: any): Promise<string> {
    return "";
  }

  protected override _replaceHTML(_result: string, _content: HTMLElement, _options: any): void {}

  protected override async _onRender(_context: object, _options: any) {
    await super._onRender?.(_context, _options);
    const target = this.element.querySelector(".window-content") || this.element;

    if (this.svelteInstance) {
      unmount(this.svelteInstance);
    }

    this.svelteInstance = mount(MassEditUI, {
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
