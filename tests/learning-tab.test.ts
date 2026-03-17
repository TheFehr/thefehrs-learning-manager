import { describe, it, expect, vi, beforeEach } from "vitest";
import { LearningTab } from "../src/tabs/learning-tab";
import { ActorProxy } from "../src/actor-proxy";
import { Settings } from "../src/settings";

vi.mock("../src/actor-proxy");
vi.mock("../src/settings");

describe("LearningTab", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should calculate canAbort correctly for projects", async () => {
    const mockActor = new (globalThis as any).Actor();
    const proxyMock = {
      bank: { total: 10 },
      projects: [
        { id: "p1", templateId: "t1", progress: 0, isCompleted: false },
        { id: "p2", templateId: "t1", progress: 5, isCompleted: false },
      ],
    };
    vi.mocked(ActorProxy.forActor).mockReturnValue(proxyMock as any);

    vi.spyOn(Settings, "timeUnits", "get").mockReturnValue([]);
    vi.spyOn(Settings, "projectTemplates", "get").mockReturnValue([
      { id: "t1", name: "Template 1", target: 10, requirements: [] },
    ] as any);
    vi.spyOn(Settings, "guidanceTiers", "get").mockReturnValue([]);

    // Also mock user
    (globalThis as any).game.user = { isGM: false };

    const data = await LearningTab.getData(mockActor as any);

    expect(data.activeProjects).toHaveLength(2);
    expect(data.activeProjects[0].canAbort).toBe(true);
    expect(data.activeProjects[1].canAbort).toBe(false);
  });
});
