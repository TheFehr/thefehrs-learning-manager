import { describe, it, expect, vi, beforeEach } from "vitest";
import { PartyTab } from "../src/tabs/party-tab";
import { TheFehrsLearningManager } from "../src/main";
import { Settings } from "../src/settings";

describe("PartyTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(Settings, "timeUnits", "get").mockReturnValue([
      { id: "hour", name: "Hour", short: "h", isBulk: false, ratio: 1 },
    ]);
    vi.spyOn(Settings, "guidanceTiers", "get").mockReturnValue([
      { id: "tier1", name: "Tier 1", modifier: 2, costs: {}, progress: {} },
    ]);

    global.game = {
      user: { isGM: true },
      actors: {
        get: vi.fn(),
      },
      settings: {
        get: vi.fn(),
      },
    } as any;
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
              guidanceTierId: "tier1",
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
});
