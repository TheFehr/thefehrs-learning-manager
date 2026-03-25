import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActorProxy } from "../src/actor-proxy";
import { Settings } from "../src/core/settings";

describe("ActorProxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Settings, "guidanceTiers", "get").mockReturnValue([
      { id: "tier1", name: "Tier 1", modifier: 2, costs: {}, progress: {} },
    ]);
  });

  it("getMappedProjects should return correctly mapped data", () => {
    const mockActor = {
      id: "actor1",
      name: "Test Actor",
      items: [
        {
          id: "item1",
          name: "Project 1",
          getFlag: vi.fn().mockImplementation((scope, key) => {
            if (key === "isLearningProject") return true;
            if (key === "projectData") return { progress: 10, target: 100, tutelageId: "tier1" };
            return null;
          }),
        },
        {
          id: "item2",
          name: "Other Item",
          getFlag: vi.fn().mockReturnValue(false),
        },
      ],
    } as any;

    const proxy = new ActorProxy(mockActor);
    const projects = proxy.getMappedProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      id: "item1",
      name: "Project 1",
      progress: 10,
      target: 100,
      percentage: 10,
      tutelageName: "Tier 1",
    });
  });

  it("getMappedProjects should handle zero target to avoid division by zero", () => {
    const mockActor = {
      items: [
        {
          id: "item1",
          name: "Project 1",
          getFlag: vi.fn().mockImplementation((scope, key) => {
            if (key === "isLearningProject") return true;
            if (key === "projectData") return { progress: 10, target: 0, tutelageId: "tier1" };
            return null;
          }),
        },
      ],
    } as any;

    const proxy = new ActorProxy(mockActor);
    const projects = proxy.getMappedProjects();

    expect(projects[0].percentage).toBe(0);
  });
});
