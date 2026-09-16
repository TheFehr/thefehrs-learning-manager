import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TabBar from "@/apps/components/TabBar.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("TabBar.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  const tabs = [
    { id: "rules", label: "Rules", icon: "fas fa-sliders-h" },
    { id: "compendiums", label: "Compendiums", icon: "fas fa-box-open" },
  ];

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
  });

  it("exposes proper ARIA tab semantics, including the active tab, to assistive technology", async () => {
    instance = mount(TabBar, {
      target,
      props: { tabs, activeTab: "rules" },
    });
    await tick();

    const tabList = target.querySelector(".tab-bar");
    expect(tabList?.getAttribute("role")).toBe("tablist");

    const buttons = target.querySelectorAll("button.tab-btn");
    expect(buttons[0].getAttribute("role")).toBe("tab");
    expect(buttons[0].getAttribute("id")).toBe("tab-rules");
    expect(buttons[0].getAttribute("aria-controls")).toBe("tabpanel-rules");
    expect(buttons[0].getAttribute("aria-selected")).toBe("true");
    expect(buttons[1].getAttribute("aria-selected")).toBe("false");

    (buttons[1] as HTMLButtonElement).click();
    await tick();

    expect(buttons[0].getAttribute("aria-selected")).toBe("false");
    expect(buttons[1].getAttribute("aria-selected")).toBe("true");
  });
});
