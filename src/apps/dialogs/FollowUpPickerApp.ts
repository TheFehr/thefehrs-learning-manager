import FollowUpPicker from "./FollowUpPicker.svelte";
import { mount, unmount } from "svelte";

const { ApplicationV2 } = foundry.applications.api;

export class FollowUpPickerApp extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    window: { title: "Add Follow-up Project", resizable: true },
    position: { width: 450, height: 500 },
  };

  private instance: any = null;
  private parentItem: any;
  private onSelect: (uuid: string) => void;

  constructor(parentItem: any, onSelect: (uuid: string) => void, options = {}) {
    super(options);
    this.parentItem = parentItem;
    this.onSelect = onSelect;
  }

  protected override async _renderHTML() {
    return "";
  }
  protected override _replaceHTML() {}

  protected override async _onRender() {
    if (this.instance) return;
    const target = this.element.querySelector(".window-content") || this.element;
    this.instance = mount(FollowUpPicker, {
      target,
      props: {
        parentItem: this.parentItem,
        onSelect: (uuid: string) => {
          this.onSelect(uuid);
          this.close();
        },
        onClose: () => this.close(),
      },
    });
  }

  override async close(o = {}) {
    if (this.instance) {
      unmount(this.instance);
      this.instance = null;
    }
    return super.close(o);
  }
}
