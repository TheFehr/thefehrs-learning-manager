import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActorProxy } from "../../src/logic/actor-proxy";

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
      isSelfStudy: false,
    });
  });

  it("projects getter should map correctly and include progressPercentage", () => {
    const mockActor = {
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
      ],
    } as any;

    const proxy = new ActorProxy(mockActor);
    const projects = proxy.projects;

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      id: "item1",
      name: "Project 1",
      progress: 10,
      target: 100,
      percentage: 10,
      tutelageName: "Tier 1",
      guidanceType: "Tier 1",
      progressPercentage: 10,
      isSelfStudy: false,
    });
  });

  it("projects getter should prefer progressPercentage from flags if present", () => {
    const mockActor = {
      items: [
        {
          id: "item-pref",
          name: "Project Pref",
          getFlag: vi.fn().mockImplementation((scope, key) => {
            if (key === "isLearningProject") return true;
            if (key === "projectData")
              return {
                progress: 10,
                target: 100,
                progressPercentage: 42,
                lastInstructorName: "Tier 1",
              };
            return null;
          }),
        },
      ],
    } as any;

    const proxy = new ActorProxy(mockActor);
    const projects = proxy.projects;

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      id: "item-pref",
      name: "Project Pref",
      progress: 10,
      target: 100,
      percentage: 10,
      tutelageName: "Tier 1",
      guidanceType: "Tier 1",
      progressPercentage: 42,
      isSelfStudy: false,
    });
  });

  it("projects getter should use 'Self-Study' if lastInstructorName is missing", () => {
    const mockActor = {
      items: [
        {
          id: "item2",
          name: "Project 2",
          getFlag: vi.fn().mockImplementation((scope, key) => {
            if (key === "isLearningProject") return true;
            if (key === "projectData") return { progress: 50, target: 100 };
            return null;
          }),
        },
      ],
    } as any;

    const proxy = new ActorProxy(mockActor);
    const projects = proxy.projects;

    expect(projects).toHaveLength(1);
    expect(projects[0]).toEqual({
      id: "item2",
      name: "Project 2",
      progress: 50,
      target: 100,
      percentage: 50,
      tutelageName: "Self-Study",
      guidanceType: "Self-Study",
      progressPercentage: 50,
      isSelfStudy: true,
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

    it("should return currency correctly", () => {
      mockActor.system = { currency: { cp: 2, sp: 5, ep: 0, gp: 10, pp: 0 } };
      expect(proxy.currency).toEqual({ cp: 2, sp: 5, ep: 0, gp: 10, pp: 0 });
    });

    it("should handle missing currency defaults", () => {
      mockActor.system = {};
      expect(proxy.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
    });

    it("should update currency", async () => {
      const newCurrency = { cp: 0, sp: 0, ep: 0, gp: 20, pp: 0 };
      await proxy.updateCurrency(newCurrency);
      expect(mockActor.update).toHaveBeenCalledWith({ system: { currency: newCurrency } }, {});
    });

    it("should get bank from flags", () => {
      mockActor.getFlag.mockReturnValue({ total: 50 });
      expect(proxy.bank).toEqual({ total: 50 });
    });

    it("should set bank", async () => {
      const newBank = { total: 100 };
      await proxy.setBank(newBank);
      expect(mockActor.setFlag).toHaveBeenCalledWith("thefehrs-learning-manager", "bank", newBank);
    });

    it("should set bank silently", async () => {
      const { DocumentUtils } = await import("../../src/core/document-utils");
      const spy = vi.spyOn(DocumentUtils, "setFlagsSilently").mockResolvedValue(true);

      const newBank = { total: 100 };
      await proxy.setBank(newBank, { render: false });

      expect(spy).toHaveBeenCalledWith(mockActor, { bank: newBank });
      spy.mockRestore();
    });

    it("should throw if silent setBank fails", async () => {
      const { DocumentUtils } = await import("../../src/core/document-utils");
      const spy = vi.spyOn(DocumentUtils, "setFlagsSilently").mockResolvedValue(false);

      await expect(proxy.setBank({ total: 100 }, { render: false })).rejects.toThrow(
        "Failed to set bank silently",
      );
      spy.mockRestore();
    });

    it("should create embedded documents", async () => {
      mockActor.createEmbeddedDocuments = vi.fn().mockResolvedValue([{ id: "item1" }]);
      const data = [{ name: "New Item" }];
      const result = await proxy.createEmbeddedDocuments("Item", data);

      expect(mockActor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", data);
      expect(result).toHaveLength(1);
    });

    it("should delete embedded documents", async () => {
      mockActor.deleteEmbeddedDocuments = vi.fn().mockResolvedValue(["item1"]);
      const ids = ["item1"];
      const result = await proxy.deleteEmbeddedDocuments("Item", ids);

      expect(mockActor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ids);
      expect(result).toEqual(["item1"]);
    });
  });
});
