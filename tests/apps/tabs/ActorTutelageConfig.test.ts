import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ActorTutelageConfig from "@/apps/tabs/ActorTutelageConfig.svelte";
import { mount, unmount, tick } from "svelte";
import { Settings } from "@/core/settings";
import { ActorConfigLogic } from "@/logic/actor-config-logic";

vi.unmock("svelte");

vi.mock("@/core/settings", () => ({
  Settings: {
    get: vi.fn(),
  },
}));

vi.mock("@/logic/actor-config-logic", () => ({
  ActorConfigLogic: {
    saveConfig: vi.fn().mockResolvedValue(true),
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
    vi.useRealTimers();
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

  it("should add a new offering when clicking the add button", async () => {
    const mockActor = {
      getFlag: vi.fn().mockReturnValue([]),
    } as any;

    instance = mount(ActorTutelageConfig, {
      target,
      props: { actor: mockActor } as any,
    });
    await tick();
    await tick();

    // Enable configuration first
    const checkbox = target.querySelector("#learning-mode-enabled") as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    await tick();

    const addBtn = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add New Lesson"),
    );
    expect(addBtn).toBeDefined();
    addBtn!.click();
    await tick();

    expect(target.querySelectorAll(".offering-card")).toHaveLength(1);
    const nameInput = target.querySelector('[data-testid="lesson-name-input"]') as HTMLInputElement;
    expect(nameInput.value).toBe("New Lesson");
  });

  it("should remove an offering when clicking the delete button", async () => {
    const mockActor = {
      getFlag: vi
        .fn()
        .mockReturnValue([{ name: "To Delete", modifier: 1, costs: {}, categories: [] }]),
    } as any;

    instance = mount(ActorTutelageConfig, {
      target,
      props: { actor: mockActor } as any,
    });
    await tick();
    await tick();

    expect(target.querySelectorAll(".offering-card")).toHaveLength(1);

    const deleteBtn = target.querySelector("button[title='Remove Offering']") as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    deleteBtn.click();
    await tick();

    expect(target.querySelectorAll(".offering-card")).toHaveLength(0);
  });

  it("should trigger auto-save when data changes", async () => {
    vi.useFakeTimers();
    const mockActor = {
      getFlag: vi.fn().mockImplementation((scope, key) => {
        if (key === "teacherOfferings") {
          return [{ name: "Initial", modifier: 1, costs: { hour: 0 }, categories: [] }];
        }
        if (key === "learningModeEnabled") return true;
        return null;
      }),
    } as any;

    instance = mount(ActorTutelageConfig, {
      target,
      props: { actor: mockActor } as any,
    });
    await tick();
    await tick();

    const nameInput = target.querySelector('[data-testid="lesson-name-input"]') as HTMLInputElement;
    nameInput.value = "Updated Name";
    // Svelte 5 needs input event for bind:value update usually,
    // but here we might need to manually trigger it if bind:value doesn't catch the direct assignment
    nameInput.dispatchEvent(new Event("input"));
    await tick();

    // Auto-save has 500ms debounce
    vi.advanceTimersByTime(600);
    await tick();

    expect(ActorConfigLogic.saveConfig).toHaveBeenCalledWith(
      mockActor,
      expect.arrayContaining([expect.objectContaining({ name: "Updated Name" })]),
      true,
    );
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
