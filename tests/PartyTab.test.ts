import { describe, it, expect, vi, beforeEach } from "vitest";
import PartyTab from "../src/apps/tabs/PartyTab.svelte";
import { mount, unmount, tick } from "svelte";
import { toggleUserGM } from "./setup";

vi.unmock("svelte");

vi.mock("../src/apps/party-tab-logic", () => ({
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
            tutelageId: "tier1",
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
    toggleUserGM(true);
  });

  it("should mount and display members", async () => {
    const target = document.createElement("div");
    const instance = mount(PartyTab, {
      target,
      props: mockProps as any,
    });
    await tick();

    expect(target.innerHTML).toContain("Actor 1");
    expect(target.innerHTML).toContain("Project 1");
    expect(target.innerHTML).toContain("Tier 1");
    unmount(instance);
  });

  it("should show empty state if member has no projects", async () => {
    const target = document.createElement("div");
    const membersWithNoProjects = [{ ...mockProps.members[0], projects: [] }];
    const instance = mount(PartyTab, {
      target,
      props: { ...mockProps, members: membersWithNoProjects } as any,
    });
    await tick();

    expect(target.innerHTML).toContain("No active projects");
    unmount(instance);
  });
});
