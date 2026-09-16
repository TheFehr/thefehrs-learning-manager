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

  it("exposes the active tab to assistive technology via aria-pressed", async () => {
    instance = mount(TabBar, {
      target,
      props: { tabs, activeTab: "rules" },
    });
    await tick();

    const buttons = target.querySelectorAll("button.tab-btn");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("false");

    (buttons[1] as HTMLButtonElement).click();
    await tick();

    expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
  });
});
