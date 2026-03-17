import { describe, it, expect, vi, beforeEach } from "vitest";
import { PartyTab } from "../src/tabs/party-tab";
import { ActorProxy } from "../src/actor-proxy";
import { Settings } from "../src/settings";

vi.mock("../src/actor-proxy");
vi.mock("../src/settings");

describe("PartyTab", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should calculate canAbort correctly for projects based on progress and GM status", async () => {
    const mockPartyActor = {
      type: "group",
      system: {
        members: [{ id: "actor1" }],
      },
    };

    const mockActor = new (globalThis as any).Actor();
    mockActor.id = "actor1";
    (globalThis as any).game.actors.get = vi.fn().mockReturnValue(mockActor);

    const proxyMock = {
      id: "actor1",
      name: "Actor 1",
      bank: { total: 10 },
      projects: [
        { id: "p1", templateId: "t1", progress: 0, isCompleted: false },
        { id: "p2", templateId: "t1", progress: 5, isCompleted: false },
      ],
      currency: { gp: 0, sp: 0, cp: 0 },
    };
    vi.mocked(ActorProxy.forActor).mockReturnValue(proxyMock as any);

    vi.spyOn(Settings, "timeUnits", "get").mockReturnValue([]);
    vi.spyOn(Settings, "projectTemplates", "get").mockReturnValue([
      { id: "t1", name: "Template 1", target: 10, requirements: [] },
    ] as any);
    vi.spyOn(Settings, "guidanceTiers", "get").mockReturnValue([]);

    // Test as non-GM
    (globalThis as any).game.user = { isGM: false };
    let data = await PartyTab.getData(mockPartyActor as any);
    expect(data.members).toHaveLength(1);
    expect(data.members[0].projects[0].canAbort).toBe(true);
    expect(data.members[0].projects[1].canAbort).toBe(false);

    // Test as GM
    (globalThis as any).game.user = { isGM: true };
    data = await PartyTab.getData(mockPartyActor as any);
    expect(data.members[0].projects[0].canAbort).toBe(true);
    expect(data.members[0].projects[1].canAbort).toBe(true); // GM can abort any project
  });
});
