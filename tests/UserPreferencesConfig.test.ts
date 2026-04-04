import { describe, it, expect, vi, beforeEach } from "vitest";
import UserPreferencesConfig from "../src/apps/components/UserPreferencesConfig.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("UserPreferencesConfig.svelte", () => {
  const mockTimeUnits = [{ id: "hour", name: "Hour", short: "h" }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should mount and show preferences", async () => {
    const target = document.createElement("div");
    const instance = mount(UserPreferencesConfig, {
      target,
      props: { autoSpend: true, autoSpendUnits: ["hour"], timeUnits: mockTimeUnits as any },
    });
    await tick();

    expect(target.innerHTML).toContain("User Preferences");
    const checkbox = target.querySelector("#auto-spend") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(target.innerHTML).toContain("Hour");
    unmount(instance);
  });
});
