import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PartyTab from "../../../src/apps/tabs/PartyTab.svelte";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

vi.mock("../../../src/logic/party-tab-logic", () => ({
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
    tierOptions: { tier1: "Tier 1" },
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
});
