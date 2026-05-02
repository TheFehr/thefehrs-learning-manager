import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PartyTab from "@/apps/tabs/PartyTab.svelte";
import { mount, unmount, tick } from "svelte";
import { PartyTabLogic } from "@/logic/party-tab-logic";

vi.unmock("svelte");

vi.mock("@/logic/party-tab-logic", () => ({
  PartyTabLogic: {
    openActorSheet: vi.fn(),
    grantTime: vi.fn(),
    updateGuidance: vi.fn(),
    updateProgress: vi.fn(),
    updateTarget: vi.fn(),
    deleteProject: vi.fn(),
  },
}));

describe("PartyTab.svelte", () => {
  let instance: any;
  let target: HTMLElement;

  const mockActor = {
    id: "party1",
    name: "Party",
  } as any;

  const mockProps = {
    actor: mockActor,
    members: [
      {
        id: "actor1",
        uuid: "Actor.actor1",
        name: "Actor 1",
        img: "img1.png",
        formattedBank: "10h",
        projects: [
          {
            id: "proj1",
            name: "Project 1",
            progress: 5,
            maxProgress: 10,
            progressPercentage: 50,
            guidanceType: "Tier 1",
            canAbort: true,
          },
        ],
      },
    ],
    isGM: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
    vi.restoreAllMocks();
  });

  it("should mount and display members", async () => {
    instance = mount(PartyTab, {
      target,
      props: mockProps as any,
    });
    await tick();

    expect(target.innerHTML).toContain("Actor 1");
    expect(target.innerHTML).toContain("Project 1");
    expect(target.innerHTML).toContain("Tier 1");
  });

  it("should show empty state if member has no projects", async () => {
    const membersWithNoProjects = [{ ...mockProps.members[0], projects: [] }];
    instance = mount(PartyTab, {
      target,
      props: { ...mockProps, members: membersWithNoProjects } as any,
    });
    await tick();

    expect(target.innerHTML).toContain("No active projects");
  });

  it("should trigger openActorSheet when clicking on an actor container", async () => {
    instance = mount(PartyTab, {
      target,
      props: mockProps as any,
    });
    await tick();

    const actorContainer = target.querySelector(".actor-container") as HTMLElement;
    expect(actorContainer).not.toBeNull();
    actorContainer.click();

    expect(PartyTabLogic.openActorSheet).toHaveBeenCalledWith("Actor.actor1");
  });

  it("should trigger grantTime when clicking the distribute time button", async () => {
    instance = mount(PartyTab, {
      target,
      props: mockProps as any,
    });
    await tick();

    const grantBtn = target.querySelector(".grant-time-btn") as HTMLButtonElement;
    expect(grantBtn).not.toBeNull();
    grantBtn.click();

    expect(PartyTabLogic.grantTime).toHaveBeenCalledWith(mockProps.members, mockActor);
  });

  it("should allow editing progress and target in edit mode", async () => {
    instance = mount(PartyTab, {
      target,
      props: mockProps as any,
    });
    await tick();

    // Toggle edit mode
    const toggleBtn = target.querySelector(".toggle-progress-edit") as HTMLButtonElement;
    toggleBtn.click();
    await tick();

    // Change Progress
    const progressInput = target.querySelector(".update-project-progress") as HTMLInputElement;
    expect(progressInput).not.toBeNull();
    progressInput.value = "7";
    progressInput.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    await tick();

    expect(PartyTabLogic.updateProgress).toHaveBeenCalledWith(
      "Actor.actor1",
      expect.objectContaining({ id: "proj1", progress: 7 }),
      7,
      true,
      mockActor,
    );

    // Change Target
    const targetInput = target.querySelector(".update-project-target") as HTMLInputElement;
    expect(targetInput).not.toBeNull();
    targetInput.value = "20";
    targetInput.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    await tick();

    expect(PartyTabLogic.updateTarget).toHaveBeenCalledWith(
      "Actor.actor1",
      expect.objectContaining({ id: "proj1", maxProgress: 20 }),
      20,
      true,
      mockActor,
    );
  });

  it("should trigger deleteProject when clicking the delete button in edit mode", async () => {
    instance = mount(PartyTab, {
      target,
      props: mockProps as any,
    });
    await tick();

    // Toggle edit mode
    const toggleBtn = target.querySelector(".toggle-progress-edit") as HTMLButtonElement;
    toggleBtn.click();
    await tick();

    const deleteBtn = target.querySelector(".delete-project") as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    deleteBtn.click();

    expect(PartyTabLogic.deleteProject).toHaveBeenCalledWith(
      "Actor.actor1",
      expect.objectContaining({ id: "proj1" }),
      undefined,
      true,
      mockActor,
    );
  });
});
