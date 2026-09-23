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

  it("uses a roving tabindex so only the selected tab is in the page tab order", async () => {
    instance = mount(TabBar, {
      target,
      props: { tabs, activeTab: "rules" },
    });
    await tick();

    const buttons = target.querySelectorAll("button.tab-btn");
    expect(buttons[0].getAttribute("tabindex")).toBe("0");
    expect(buttons[1].getAttribute("tabindex")).toBe("-1");

    (buttons[1] as HTMLButtonElement).click();
    await tick();

    expect(buttons[0].getAttribute("tabindex")).toBe("-1");
    expect(buttons[1].getAttribute("tabindex")).toBe("0");
  });

  it("moves focus and selection with ArrowRight/ArrowDown, wrapping to the first tab", async () => {
    instance = mount(TabBar, {
      target,
      props: { tabs, activeTab: "rules" },
    });
    await tick();

    const buttons = target.querySelectorAll("button.tab-btn");
    (buttons[0] as HTMLButtonElement).focus();

    buttons[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
    );
    await tick();

    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1].getAttribute("aria-selected")).toBe("true");
    expect(buttons[1].getAttribute("tabindex")).toBe("0");
    expect(buttons[0].getAttribute("tabindex")).toBe("-1");

    buttons[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
    await tick();

    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0].getAttribute("aria-selected")).toBe("true");
  });

  it("moves focus and selection with ArrowLeft/ArrowUp, wrapping to the last tab", async () => {
    instance = mount(TabBar, {
      target,
      props: { tabs, activeTab: "rules" },
    });
    await tick();

    const buttons = target.querySelectorAll("button.tab-btn");
    (buttons[0] as HTMLButtonElement).focus();

    buttons[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }),
    );
    await tick();

    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1].getAttribute("aria-selected")).toBe("true");

    buttons[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
    );
    await tick();

    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0].getAttribute("aria-selected")).toBe("true");
  });

  it("jumps to the first/last tab on Home/End", async () => {
    instance = mount(TabBar, {
      target,
      props: { tabs, activeTab: "rules" },
    });
    await tick();

    const buttons = target.querySelectorAll("button.tab-btn");
    (buttons[0] as HTMLButtonElement).focus();

    buttons[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }),
    );
    await tick();

    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1].getAttribute("aria-selected")).toBe("true");

    buttons[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }),
    );
    await tick();

    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0].getAttribute("aria-selected")).toBe("true");
  });
});
