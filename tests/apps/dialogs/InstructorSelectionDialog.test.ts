import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import InstructorSelectionDialog from "@/apps/dialogs/InstructorSelectionDialog.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("InstructorSelectionDialog.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  const mockTimeUnits = { id: "hour", name: "Hour", isBulk: false };
  const mockInstructors = [
    {
      actorUuid: "actor-1",
      name: "Teacher 1",
      offering: {
        name: "Math",
        modifier: 5,
        costs: { hour: 100 },
        categories: ["skill:ath"],
      },
    },
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

  it("should mount and show options", async () => {
    instance = mount(InstructorSelectionDialog, {
      target,
      props: {
        instructors: mockInstructors,
        bestBookMod: 2,
        bestBookNames: "Old Book",
        timeUnit: mockTimeUnits,
      } as any,
    });

    await tick();

    expect(target.innerHTML).toContain("Teacher 1");
    expect(target.innerHTML).toContain("Math");
    expect(target.innerHTML).toContain("+5");
    expect(target.innerHTML).toContain("Self-Study");
    expect(target.innerHTML).toContain("Old Book");
    expect(target.innerHTML).toContain("+2");
  });

  it("should select an instructor and update summary", async () => {
    instance = mount(InstructorSelectionDialog, {
      target,
      props: {
        instructors: mockInstructors,
        bestBookMod: 0,
        timeUnit: mockTimeUnits,
      } as any,
    });

    await tick();

    const radio = target.querySelector('input[data-actor-uuid="actor-1"]') as HTMLInputElement;
    expect(radio).not.toBeNull();

    radio.checked = true;
    radio.dispatchEvent(new Event("change"));

    await tick();

    expect(target.querySelector(".summary .value")?.textContent).toContain("+5");
    // Costs are formatted, 100 CP = 1 GP
    expect(target.innerHTML).toContain("1gp");
  });

  it("should return the selected instructor via getResult", async () => {
    instance = mount(InstructorSelectionDialog, {
      target,
      props: {
        instructors: mockInstructors,
        bestBookMod: 0,
        timeUnit: mockTimeUnits,
      } as any,
    });

    await tick();

    const radio = target.querySelector('input[data-actor-uuid="actor-1"]') as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event("change"));

    await tick();

    const result = instance.getResult();
    expect(result.instructor).toEqual(mockInstructors[0]);
    expect(result.remember).toBe(false);

    // Toggle remember
    const checkbox = target.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    await tick();

    expect(instance.getResult().remember).toBe(true);
  });
});
