import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TimeBankBar from "@/apps/components/TimeBankBar.svelte";
import { mount, unmount, tick } from "svelte";
import { Settings } from "@/core/settings";
import { ActorProxy } from "@/logic/actor-proxy";

vi.unmock("svelte");

vi.mock("@/core/settings", () => ({
  Settings: {
    get: vi.fn(),
  },
}));

vi.mock("@/logic/actor-proxy", () => ({
  ActorProxy: {
    forActor: vi.fn(),
  },
}));

vi.mock("@/logic/time-bank-logic", () => ({
  TimeBankLogic: {
    getTimeValue: vi.fn().mockReturnValue(10),
    updateTime: vi.fn(),
  },
}));

describe("TimeBankBar.svelte", () => {
  let target: HTMLElement;
  let instance: any;
  const mockUnits = [{ id: "hour", name: "Hour", short: "h", ratio: 1 }];
  const mockActor = { id: "actor1" };
  const mockProxy = { bank: { total: 100 } };

  beforeEach(() => {
    vi.clearAllMocks();
    (Settings.get as any).mockReturnValue(mockUnits);
    (ActorProxy.forActor as any).mockReturnValue(mockProxy);
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
  });

  it("should mount and show total time", async () => {
    instance = mount(TimeBankBar, {
      target,
      props: { actor: mockActor as any },
    });
    await tick();

    const totalSpan = target.querySelector(".total-time .value");
    expect(totalSpan?.textContent).toBe("100");
  });

  it("should show unit inputs", async () => {
    instance = mount(TimeBankBar, {
      target,
      props: { actor: mockActor as any },
    });
    await tick();

    const input = target.querySelector("input[type='number']") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("10");
  });
});
