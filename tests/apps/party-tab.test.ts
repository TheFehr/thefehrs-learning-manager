import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PartyTab } from "../../src/apps/party-tab";
import { Settings } from "../../src/core/settings";
import { PartyTabPending } from "../../src/logic/party-tab-pending";

describe("PartyTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PartyTabPending.clear();

    vi.spyOn(Settings, "get").mockImplementation((key) => {
      if (key === "timeUnits") {
        return [{ id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 }];
      }
      return null;
    });

    globalThis.game = {
      user: { isGM: true },
      actors: {
        get: vi.fn(),
      },
      settings: {
        get: vi.fn(),
      },
    } as any;

    globalThis.Actor = class Actor {
      id = "";
      name = "";
      items = [];
      system = { abilities: {}, attributes: {} };
      getFlag = vi.fn();
      getRollData = vi.fn().mockReturnValue({});
    } as any;
  });

  afterEach(() => {
    delete (globalThis as any).game;
    delete (globalThis as any).Actor;
    vi.restoreAllMocks();
  });

  it("should return empty members if partyActor has no members", () => {
    const partyActor = { system: { members: [] } } as any;
    const data = PartyTab.getData(partyActor);
    expect(data.members).toHaveLength(0);
    expect(data.isGM).toBe(true);
  });

  it("should map member data correctly", () => {
    const actor = new Actor() as any;
    actor.id = "actor1";
    actor.name = "Test Actor";
    actor.items = [
      {
        id: "item1",
        name: "Learning Item",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "isLearningProject") return true;
          if (key === "projectData")
            return {
              progress: 5,
              target: 10,
              lastInstructorName: "Tier 1",
              isCompleted: false,
            };
          return null;
        }),
      },
    ];
    vi.mocked(game.actors.get).mockReturnValue(actor);

    const partyActor = {
      system: {
        members: [{ actorId: "actor1" }],
      },
    } as any;

    const data = PartyTab.getData(partyActor);
    expect(data.members).toHaveLength(1);
    const m = data.members[0];
    expect(m.name).toBe("Test Actor");
    expect(m.projects).toHaveLength(1);
    expect(m.projects[0].name).toBe("Learning Item");
    expect(m.projects[0].progressPercentage).toBe(50);
    expect(m.projects[0].guidanceType).toBe("Tier 1");
  });

  it("should exclude completed projects from the member's project list", () => {
    // Regression coverage for the bug where ActorProxy.getMappedProjects()
    // never populated isCompleted, making this filter a silent no-op -
    // completed rewards stayed visible in the Party tab indefinitely.
    const actor = new Actor() as any;
    actor.id = "actor1";
    actor.name = "Test Actor";
    actor.items = [
      {
        id: "item1",
        name: "In Progress Item",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "isLearningProject") return true;
          if (key === "projectData") return { progress: 5, target: 10 };
          return null;
        }),
      },
      {
        id: "item2",
        name: "Completed Item",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "isLearnedReward") return true;
          if (key === "projectData") return { progress: 10, target: 10, isCompleted: true };
          return null;
        }),
      },
    ];
    vi.mocked(game.actors.get).mockReturnValue(actor);

    const partyActor = {
      system: {
        members: [{ actorId: "actor1" }],
      },
    } as any;

    const data = PartyTab.getData(partyActor);
    const m = data.members[0];
    expect(m.projects).toHaveLength(1);
    expect(m.projects[0].name).toBe("In Progress Item");
  });

  // Regression coverage for thefehrs-learning-manager#131's e2e failure:
  // LearningManager.renderSvelte remounts the Party tab's Svelte component
  // fresh on every render of its parent sheet (not a props-only update), so
  // a remount landing between a GM's manual progress edit and that write
  // actually landing would otherwise call getData() and read the item's
  // still-stale flag data, with the edit's own "silent" write leaving
  // nothing to correct it afterward. PartyTabPending overlays a pending
  // edit onto exactly this kind of fresh read - see its own comment.
  it("overlays a pending PartyTabPending edit onto a fresh read that hasn't caught up yet", () => {
    const actor = new Actor() as any;
    actor.id = "actor1";
    actor.name = "Test Actor";
    actor.uuid = "Actor.actor1";
    actor.items = [
      {
        id: "item1",
        name: "Learning Item",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (key === "isLearningProject") return true;
          // Still the pre-write value - simulates a remount landing before
          // the GM's manual edit's silent write has confirmed.
          if (key === "projectData") return { progress: 5, target: 10 };
          return null;
        }),
      },
    ];
    vi.mocked(game.actors.get).mockReturnValue(actor);

    PartyTabPending.setProgress("Actor.actor1", "item1", 8);

    const partyActor = { system: { members: [{ actorId: "actor1" }] } } as any;
    const data = PartyTab.getData(partyActor);

    expect(data.members[0].projects[0].progress).toBe(8);
    expect(data.members[0].projects[0].progressPercentage).toBe(80);
    // The item's displayed name bakes in "(progress/target)" (see
    // ProjectLifecycle.updateItemWithProgress) - the overlay needs to keep
    // that in sync too, since it's what a GM actually sees confirm an edit.
    expect(data.members[0].projects[0].name).toBe("Learning Item (8/10)");

    // Once a read actually confirms the write landed, the pending entry
    // clears and stops overriding subsequent reads.
    actor.items[0].getFlag = vi.fn().mockImplementation((scope, key) => {
      if (key === "isLearningProject") return true;
      if (key === "projectData") return { progress: 8, target: 10 };
      return null;
    });
    const confirmed = PartyTab.getData(partyActor);
    expect(confirmed.members[0].projects[0].progress).toBe(8);
  });
});
