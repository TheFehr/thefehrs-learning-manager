import ProjectOverview from "./overview/ProjectOverview.svelte";
import { mount, unmount } from "svelte";

const { ApplicationV2 } = foundry.applications.api;

export class ProjectOverviewApp extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: "learning-manager-project-overview",
    tag: "div",
    window: {
      title: "Learning Manager: Project Overview",
      width: 600,
      resizable: true,
    },
    position: {
      height: 400,
    },
  };

  private svelteInstance: Record<string, unknown> | null = null;

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

    this.svelteInstance = mount(ProjectOverview, {
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
