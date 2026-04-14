import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ActorTutelageConfig from "../../../src/apps/tabs/ActorTutelageConfig.svelte";
import { mount, unmount, tick } from "svelte";
import { Settings } from "../../../src/core/settings";

vi.unmock("svelte");

vi.mock("../../../src/core/settings", () => ({
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
});
