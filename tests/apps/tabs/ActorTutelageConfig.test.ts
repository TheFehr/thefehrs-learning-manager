import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ActorTutelageConfig from "@/apps/tabs/ActorTutelageConfig.svelte";
import { mount, unmount, tick } from "svelte";
import { Settings } from "@/core/settings";

vi.unmock("svelte");

vi.mock("@/core/settings", () => ({
  Settings: {
    get: vi.fn(),
  },
}));

describe("ActorTutelageConfig.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  const mockTimeUnits = [{ id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 }];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Settings.get).mockImplementation((key) => {
      if (key === "timeUnits") return mockTimeUnits;
      return null;
    });

    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
  });

  it("should mount and show offerings", async () => {
    const mockActor = {
      getFlag: vi.fn().mockImplementation((scope, key) => {
        if (scope === "thefehrs-learning-manager" && key === "teacherOfferings") {
          return [{ name: "Masterclass", modifier: 5, costs: { hour: 100 }, categories: [] }];
        }
        return null;
      }),
    } as any;

    instance = mount(ActorTutelageConfig, {
      target,
      props: { actor: mockActor } as any,
    });

    // Svelte 5 effects run after a tick
    await tick();
    await tick();

    const nameInput = target.querySelector('[data-testid="lesson-name-input"]') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    expect(nameInput.value).toBe("Masterclass");
    expect(target.querySelector('[data-testid="costs-per-session"]')).not.toBeNull();

    // Verify tooltip
    const costInput = target.querySelector('input[type="number"][id^="cost-"]') as HTMLInputElement;
    expect(costInput).not.toBeNull();
    expect(costInput.getAttribute("data-tooltip")).toBe("1gp");
  });

  it("should not contain the removed project UUID section", async () => {
    const mockActor = {
      getFlag: vi
        .fn()
        .mockReturnValue([
          { name: "Masterclass", modifier: 5, costs: { hour: 100 }, categories: [] },
        ]),
    } as any;

    instance = mount(ActorTutelageConfig, {
      target,
      props: { actor: mockActor } as any,
    });
    await tick();
    await tick();

    expect(target.innerHTML).not.toContain("Applicable Projects");
    expect(target.querySelector(".projects-list")).toBeNull();
  });

  it("should sanitize teacherOfferings data from actor flags", async () => {
    const mockActor = {
      getFlag: vi.fn().mockImplementation((scope, key) => {
        if (scope === "thefehrs-learning-manager") {
          if (key === "teacherOfferings") {
            return [
              {
                name: "Invalid Offering",
                modifier: "invalid",
                costs: {
                  hour: -10, // should be clamped to 0
                  unknown: 50, // should be ignored (not rendered)
                },
                categories: "not-an-array", // should be defaulted to []
              },
            ];
          }
          if (key === "learningModeEnabled") return null;
        }
        return null;
      }),
    } as any;

    instance = mount(ActorTutelageConfig, {
      target,
      props: { actor: mockActor } as any,
    });

    await tick();
    await tick();

    // Check learningModeEnabled (should be true because offerings.length > 0)
    const checkbox = target.querySelector("#learning-mode-enabled") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    // Check costs - hour should be 0 due to clamping
    const hourCostInput = target.querySelector('input[id$="-hour"]') as HTMLInputElement;
    expect(hourCostInput.value).toBe("0");
  });

  it("should handle null teacherOfferings", async () => {
    const mockActor = {
      getFlag: vi.fn().mockReturnValue(null),
    } as any;

    instance = mount(ActorTutelageConfig, {
      target,
      props: { actor: mockActor } as any,
    });

    await tick();
    await tick();

    const checkbox = target.querySelector("#learning-mode-enabled") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(target.querySelector(".offering-card")).toBeNull();
  });
});
