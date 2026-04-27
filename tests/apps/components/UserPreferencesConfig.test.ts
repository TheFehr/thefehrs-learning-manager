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

  it("should not show unit checkboxes when autoSpend is false", async () => {
    instance = mount(UserPreferencesConfig, {
      target,
      props: {
        autoSpend: false,
        autoSpendUnits: ["hour"],
        timeUnits: mockTimeUnits as any,
      },
    });
    await tick();

    expect(target.innerHTML).not.toContain("Allowed Units");
    const hourCheckbox = target.querySelector("input[data-unit-id='hour']");
    expect(hourCheckbox).toBeNull();
  });
});
