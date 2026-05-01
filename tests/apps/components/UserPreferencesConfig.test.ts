import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import UserPreferencesConfig from "@/apps/components/UserPreferencesConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("UserPreferencesConfig.svelte", () => {
  const mockTimeUnits = [
    { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
    { id: "day", name: "Day", short: "d", isBulk: true, ratio: 10 },
  ];
  let target: HTMLElement;
  let instance: ReturnType<typeof mount<typeof UserPreferencesConfig>> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
  });

  it("should mount and show preferences", async () => {
    instance = mount(UserPreferencesConfig, {
      target,
      props: {
        autoSpend: true,
        autoSpendUnits: ["hour"],
        timeUnits: mockTimeUnits as any,
      },
    });
    await tick();

    expect(target.innerHTML).toContain("Auto-spend granted time");
    const hourCheckbox = target.querySelector("input[data-unit-id='hour']") as HTMLInputElement;
    expect(hourCheckbox).not.toBeNull();
    expect(hourCheckbox.checked).toBe(true);
  });

  it("should show available units", async () => {
    instance = mount(UserPreferencesConfig, {
      target,
      props: {
        autoSpend: true,
        autoSpendUnits: ["hour", "day"],
        timeUnits: mockTimeUnits as any,
      },
    });
    await tick();

    expect(target.innerHTML).toContain("Hour");
    expect(target.innerHTML).toContain("Day");

    const dayCheckbox = target.querySelector("input[data-unit-id='day']") as HTMLInputElement;
    expect(dayCheckbox).not.toBeNull();
    expect(dayCheckbox.checked).toBe(true);
  });

  it("should toggle autoSpend and autoSpendUnits when clicked", async () => {
    let autoSpend = false;
    let autoSpendUnits: string[] = [];

    instance = mount(UserPreferencesConfig, {
      target,
      props: {
        autoSpend,
        autoSpendUnits,
        timeUnits: mockTimeUnits as any,
        // In Svelte 5, we can't easily capture bindable updates without a wrapper
        // but we can check if the UI state changed and if the internal state (if accessible) changed.
        // Or we can check if the checkboxes are checked correctly.
      },
    });
    await tick();

    const autoSpendCheckbox = target.querySelector("#auto-spend") as HTMLInputElement;
    autoSpendCheckbox.click();
    await tick();

    // Now autoSpend is true, unit checkboxes should be visible
    const hourCheckbox = target.querySelector("input[data-unit-id='hour']") as HTMLInputElement;
    expect(hourCheckbox).not.toBeNull();

    hourCheckbox.click();
    await tick();

    expect(hourCheckbox.checked).toBe(true);

    const dayCheckbox = target.querySelector("input[data-unit-id='day']") as HTMLInputElement;
    dayCheckbox.click();
    await tick();

    expect(dayCheckbox.checked).toBe(true);

    // Toggle off again
    hourCheckbox.click();
    await tick();
    expect(hourCheckbox.checked).toBe(false);
  });
});
