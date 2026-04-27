import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import GrantTimeDialog from "@/apps/dialogs/GrantTimeDialog.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

describe("GrantTimeDialog.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  const mockTimeUnits = [
    { id: "hour", name: "Hour", isBulk: false },
    { id: "day", name: "Day", isBulk: true },
  ];

  const mockMembers = [
    { id: "actor-1", name: "Actor 1", img: "img1.png" },
    { id: "actor-2", name: "Actor 2", img: "img2.png" },
  ];

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

  it("should mount and show time inputs", async () => {
    instance = mount(GrantTimeDialog, {
      target,
      props: {
        timeUnits: mockTimeUnits,
        isParty: false,
        members: [],
        onsubmit: vi.fn(),
      } as any,
    });

    await tick();

    expect(target.querySelectorAll('input[type="number"]').length).toBe(2);
    expect(target.innerHTML).toContain("Hours");
    expect(target.innerHTML).toContain("Days");
  });

  it("should show recipients list if isParty is true", async () => {
    instance = mount(GrantTimeDialog, {
      target,
      props: {
        timeUnits: mockTimeUnits,
        isParty: true,
        members: mockMembers,
        onsubmit: vi.fn(),
      } as any,
    });

    await tick();

    expect(target.innerHTML).toContain("Select Recipients");
    expect(target.innerHTML).toContain("Actor 1");
    expect(target.innerHTML).toContain("Actor 2");
    expect(target.querySelectorAll('input[type="checkbox"]').length).toBe(2);
  });

  it("should toggle recipients when clicked", async () => {
    instance = mount(GrantTimeDialog, {
      target,
      props: {
        timeUnits: mockTimeUnits,
        isParty: true,
        members: mockMembers,
        onsubmit: vi.fn(),
      } as any,
    });

    await tick();

    const checkboxes = target.querySelectorAll(
      'input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>;
    // Initially all selected if isParty is true
    expect(checkboxes[0].checked).toBe(true);

    expect(checkboxes[0]).not.toBeNull();
    checkboxes[0].click();
    await tick();
    expect(checkboxes[0].checked).toBe(false);
  });

  it("should call onsubmit with correct data when submit is called", async () => {
    const onsubmit = vi.fn();
    instance = mount(GrantTimeDialog, {
      target,
      props: {
        timeUnits: mockTimeUnits,
        isParty: true,
        members: mockMembers,
        onsubmit,
      } as any,
    });

    await tick();

    const inputs = target.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
    inputs[0].value = "5";
    inputs[0].dispatchEvent(new Event("input"));

    await tick();

    instance.submit();

    expect(onsubmit).toHaveBeenCalledWith({ hour: 5, day: 0 }, ["actor-1", "actor-2"]);
  });
});
