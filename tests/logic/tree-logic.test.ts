import { describe, it, expect, vi, beforeEach } from "vitest";
import { TreeLogic } from "@/logic/tree-logic.js";
import { Settings } from "@/core/settings.js";
import { MODULE_ID } from "@/global.js";

// Mock dependencies
vi.mock("@/core/settings.js", () => ({
  Settings: {
    get: vi.fn(),
    ID: "thefehrs-learning-manager",
  },
}));

vi.mock("@/core/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}));

describe("TreeLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global game object
    (global as any).game = {
      packs: {
        get: vi.fn(),
      },
    };
    // Mock fromUuid
    (global as any).fromUuid = vi.fn();
    (global as any).ui = {
      notifications: {
        error: vi.fn(),
        warn: vi.fn(),
      },
    };
  });

  it("should build a hierarchical tree from flat compendium items", async () => {
    const item1 = {
      uuid: "uuid1",
      name: "Root Project",
      img: "img1.png",
      getFlag: vi.fn().mockImplementation((scope, key) => {
        if (key === "projectData") return { followUpProjectId: "uuid2" };
        if (key === "isLearningProject") return true;
        return undefined;
      }),
    };
    const item2 = {
      uuid: "uuid2",
      name: "Child Project",
      img: "img2.png",
      getFlag: vi.fn().mockImplementation((scope, key) => {
        if (key === "projectData") return {};
        if (key === "isLearningProject") return true;
        return undefined;
      }),
    };

    const mockPack = {
      getDocuments: vi.fn().mockResolvedValue([item1, item2]),
    };

    vi.mocked(Settings.get).mockReturnValue(["pack1"]);
    vi.mocked((global as any).game.packs.get).mockReturnValue(mockPack);

    const forest = await TreeLogic.buildProjectTree();

    expect(forest.length).toBe(1);
    expect(forest[0].uuid).toBe("uuid1");
    expect(forest[0].children.length).toBe(1);
    expect(forest[0].children[0].uuid).toBe("uuid2");
  });

  it("should show pinned items as roots even if they are children elsewhere", async () => {
    const parent = {
      uuid: "parent",
      name: "Parent",
      getFlag: vi.fn().mockImplementation((scope, key) => {
        if (key === "projectData") return { followUpProjectId: "child" };
        if (key === "isLearningProject") return true;
        return undefined;
      }),
    };
    const child = {
      uuid: "child",
      name: "Child",
      getFlag: vi.fn().mockImplementation((scope, key) => {
        if (key === "isLearningProject") return true;
        return undefined;
      }),
    };

    const mockPack = { getDocuments: vi.fn().mockResolvedValue([parent, child]) };
    vi.mocked(Settings.get).mockReturnValue(["pack1"]);
    vi.mocked((global as any).game.packs.get).mockReturnValue(mockPack);

    const forest = await TreeLogic.buildProjectTree(false, ["child"]);

    expect(forest.length).toBe(1);
    expect(forest[0].uuid).toBe("parent");
    expect(forest[0].children[0].uuid).toBe("child");
  });

  it("should show non-project item as root if pinned", async () => {
    const regularItem = {
      uuid: "regular",
      name: "Regular Item",
      getFlag: vi.fn().mockReturnValue(undefined), // No project flags
    };

    const mockPack = { getDocuments: vi.fn().mockResolvedValue([regularItem]) };
    vi.mocked(Settings.get).mockReturnValue(["pack1"]);
    vi.mocked((global as any).game.packs.get).mockReturnValue(mockPack);

    const forest = await TreeLogic.buildProjectTree(false, ["regular"]);

    expect(forest.length).toBe(1);
    expect(forest[0].uuid).toBe("regular");
  });

  it("should detect and break circular dependencies (A -> B -> A)", async () => {
    const item1 = {
      uuid: "uuid1",
      name: "Circular 1",
      getFlag: vi.fn().mockImplementation((s, k) => {
        if (k === "projectData") return { followUpProjectId: "uuid2" };
        if (k === "isLearningProject") return true;
        return undefined;
      }),
    };
    const item2 = {
      uuid: "uuid2",
      name: "Circular 2",
      getFlag: vi.fn().mockImplementation((s, k) => {
        if (k === "projectData") return { followUpProjectId: "uuid1" };
        if (k === "isLearningProject") return true;
        return undefined;
      }),
    };

    const mockPack = {
      getDocuments: vi.fn().mockResolvedValue([item1, item2]),
    };

    vi.mocked(Settings.get).mockReturnValue(["pack1"]);
    vi.mocked((global as any).game.packs.get).mockReturnValue(mockPack);

    const forest = await TreeLogic.buildProjectTree();

    expect(forest.length).toBe(0);
  });

  it("should reparent items by updating flags correctly", async () => {
    const parent = {
      uuid: "p",
      name: "Parent",
      update: vi.fn().mockResolvedValue(true),
      getFlag: vi.fn().mockReturnValue({ followUpProjectId: "old-child" }),
    };

    const success = await TreeLogic.reparentProject(parent as any, "new-child");

    expect(success).toBe(true);
    expect(parent.update).toHaveBeenCalledWith({
      [`flags.${MODULE_ID}.projectData.followUpProjectId`]: "new-child",
    });
  });

  it("should prevent self-parenting", async () => {
    const item = { uuid: "self", name: "Self" };
    const success = await TreeLogic.reparentProject(item as any, "self");
    expect(success).toBe(false);
    expect((global as any).ui.notifications.warn).toHaveBeenCalledWith(
      expect.stringContaining("cannot be its own follow-up"),
    );
  });
});
