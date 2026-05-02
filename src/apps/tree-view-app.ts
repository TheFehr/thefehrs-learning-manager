import ProjectTreeView from "./components/ProjectTreeView.svelte";
import { mount, unmount } from "svelte";

const { ApplicationV2 } = foundry.applications.api;

/**
 * Application wrapper for the Project Tree View.
 */
export class ProjectTreeApp extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    tag: "div",
    window: {
      title: "Learning Project Tree View",
      icon: "fas fa-sitemap",
      resizable: true,
      contentClasses: ["thefehrs-learning-manager-app"],
    },
    position: {
      width: 800,
      height: 600,
    },
  };

  private svelteInstance: any = null;

  protected override async _renderHTML(_context: object, _options: any): Promise<string> {
    return ""; // Svelte handles the DOM
  }

  protected override _replaceHTML(_result: string, _content: HTMLElement, _options: any): void {
    // No-op, Svelte handles the content
  }

  protected override async _onRender(_context: object, _options: any) {
    await super._onRender?.(_context, _options);
    const target = this.element.querySelector(".window-content") || this.element;

    if (this.svelteInstance) {
      unmount(this.svelteInstance);
    }

    this.svelteInstance = mount(ProjectTreeView, {
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
