import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActorProxy } from "../../src/logic/actor-proxy";
import { Settings } from "../../src/core/settings";

describe("ActorProxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
            if (key === "projectData")
              return { progress: 10, target: 100, lastInstructorName: "Tier 1" };
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
            if (key === "projectData")
              return { progress: 10, target: 0, lastInstructorName: "Tier 1" };
            return null;
          }),
        },
      ],
    } as any;

    const proxy = new ActorProxy(mockActor);
    const projects = proxy.getMappedProjects();

    expect(projects[0].percentage).toBe(0);
  });

  describe("Basic Properties", () => {
    let mockActor: any;
    let proxy: ActorProxy;

    beforeEach(() => {
      mockActor = {
        id: "id123",
        name: "Actor Name",
        img: "actor.png",
        uuid: "Actor.id123",
        getFlag: vi.fn(),
        setFlag: vi.fn(),
        update: vi.fn().mockResolvedValue(true),
      };
      proxy = new ActorProxy(mockActor);
    });

    it("should return basic properties", () => {
      expect(proxy.id).toBe("id123");
      expect(proxy.name).toBe("Actor Name");
      expect(proxy.img).toBe("actor.png");
      expect(proxy.uuid).toBe("Actor.id123");
    });

    it("should return token image if prototype token exists", () => {
      mockActor.prototypeToken = { texture: { src: "token.png" } };
      expect(proxy.tokenImg).toBe("token.png");
    });

    it("should handle missing prototype token texture gracefully by falling back to actor image", () => {
      mockActor.prototypeToken = {};
      expect(proxy.tokenImg).toBe("actor.png");
    });

    it("should handle missing prototype token gracefully by falling back to actor image", () => {
      // prototypeToken is missing
      expect(proxy.tokenImg).toBe("actor.png");
    });

    it("should return projects from flags and verify arguments", () => {
      mockActor.getFlag.mockReturnValue([{ id: "proj1" }]);
      expect(proxy.projects).toEqual([{ id: "proj1" }]);
      expect(mockActor.getFlag).toHaveBeenCalledWith("thefehrs-learning-manager", "projects");
    });

    it("should set projects on flags", async () => {
      await proxy.setProjects([{ id: "proj2" } as any]);
      expect(mockActor.setFlag).toHaveBeenCalledWith("thefehrs-learning-manager", "projects", [
        { id: "proj2" },
      ]);
    });

    it("should return currency correctly", () => {
      mockActor.system = { currency: { gp: 10, sp: 5, cp: 2 } };
      expect(proxy.currency).toEqual({ gp: 10, sp: 5, cp: 2 });
    });

    it("should handle missing currency defaults", () => {
      mockActor.system = {};
      expect(proxy.currency).toEqual({ gp: 0, sp: 0, cp: 0 });
    });

    it("should update currency", async () => {
      const newCurrency = { gp: 20, sp: 0, cp: 0 };
      await proxy.updateCurrency(newCurrency);
      expect(mockActor.update).toHaveBeenCalledWith({ system: { currency: newCurrency } }, {});
    });
  });
});
