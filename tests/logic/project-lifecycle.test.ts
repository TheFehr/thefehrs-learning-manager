import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProjectLifecycle } from "@/logic/project-lifecycle";
import { Settings } from "@/core/settings";
import { ActivityManager } from "@/core/activity-manager";

vi.mock("@/core/settings", () => ({
  Settings: {
    ID: "thefehrs-learning-manager",
    get: vi.fn(),
  },
}));

vi.mock("@/core/activity-manager", () => ({
  ActivityManager: {
    injectActivities: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("@/core/project-ui", () => ({
  ProjectUI: {
    generateProgressHtml: vi.fn().mockReturnValue("<div>Progress</div>"),
  },
}));

describe("ProjectLifecycle", () => {
  let mockActor: any;
  let mockItem: any;
  let createdItems: any[] = [];
  const _origActor = globalThis.Actor;
  const _origItem = globalThis.Item;
  const _origFromUuid = globalThis.fromUuid;

  beforeEach(() => {
    vi.clearAllMocks();
    createdItems = [];
    (globalThis as any).Actor = class MockActor {
      constructor(data: any) {
        Object.assign(this, data);
      }
    };
    (globalThis as any).Item = class MockItem {
      constructor(data: any) {
        Object.assign(this, data);
      }
      getFlag = vi.fn().mockImplementation((scope, key) => {
        if (scope !== Settings.ID) return undefined;
        if (key === "isLearningProject") return (this as any)._isLearningProject;
        if (key === "projectData") return (this as any)._projectData;
        if (key === "projectData.stashedSourceUuid")
          return (this as any)._projectData?.stashedSourceUuid;
        return (this as any)._flags?.[key];
      });
      setFlag = vi.fn();
      update = vi.fn().mockResolvedValue(this);
      delete = vi.fn().mockResolvedValue(true);
      toObject = vi.fn().mockReturnValue({ ...this });
    };

    (Settings.get as any).mockImplementation((key: string) => {
      if (key === "rules") return { rollMode: "gmroll" };
      return null;
    });

    mockItem = new (globalThis as any).Item({
      name: "Source Item",
      uuid: "Item.Source",
      type: "feat",
      system: {
        description: { value: "Description" },
        activities: {},
      },
    });

    mockItem._projectData = { target: 10 };
    mockItem.toObject.mockReturnValue({
      name: "Source Item",
      type: "feat",
      system: { description: { value: "Description" }, activities: {} },
      flags: {},
    });

    mockActor = {
      name: "Test Actor",
      createEmbeddedDocuments: vi.fn().mockImplementation(async (type, data) => {
        const item = new (globalThis as any).Item(data[0]);
        createdItems.push(item);
        return [item];
      }),
    };
    (globalThis as any).fromUuid = vi.fn();
  });

  afterEach(() => {
    globalThis.Actor = _origActor;
    globalThis.Item = _origItem;
    globalThis.fromUuid = _origFromUuid;
  });

  describe("initiateProjectFromItem", () => {
    it("should successfully initiate a project", async () => {
      const result = await ProjectLifecycle.initiateProjectFromItem(mockActor, mockItem);

      expect(result).toBeDefined();
      expect(mockActor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
        expect.objectContaining({
          name: "Source Item (0/10)",
          type: "feat",
          flags: expect.objectContaining({
            "thefehrs-learning-manager": expect.objectContaining({
              isLearningProject: true,
              projectData: expect.objectContaining({
                stashedSourceUuid: "Item.Source",
              }),
            }),
          }),
        }),
      ]);
      expect(ActivityManager.injectActivities).toHaveBeenCalled();
    });

    it("should return null if target is invalid", async () => {
      mockItem._projectData = { target: 0 };
      const result = await ProjectLifecycle.initiateProjectFromItem(mockActor, mockItem);

      expect(result).toBeNull();
      expect(mockActor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it("should delete created item if activity injection fails", async () => {
      (ActivityManager.injectActivities as any).mockRejectedValue(new Error("Failed"));
      const result = await ProjectLifecycle.initiateProjectFromItem(mockActor, mockItem);

      expect(result).toBeNull();
      expect(createdItems[0].delete).toHaveBeenCalled();
    });
  });

  describe("completeProject", () => {
    it("should restore from source if available", async () => {
      mockItem._isLearningProject = true;
      mockItem._projectData = {
        stashedSourceUuid: "Item.Source",
        target: 10,
        progress: 10,
      };
      const mockSourceItem = new (globalThis as any).Item({ name: "Source" });
      mockSourceItem.toObject = vi.fn().mockReturnValue({ name: "Source" });
      (globalThis as any).fromUuid.mockResolvedValue(mockSourceItem);
      mockItem.actor = mockActor;

      await ProjectLifecycle.completeProject(mockItem);

      expect(mockActor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
        expect.objectContaining({
          name: "Source",
        }),
      ]);
      expect(mockItem.delete).toHaveBeenCalled();
    });

    it("should not preserve transient system fields when recreating item", async () => {
      mockItem._isLearningProject = true;
      mockItem._projectData = {
        stashedName: "Original Name",
        stashedSystem: { value: 10 },
        stashedActivities: { act1: { name: "Activity 1" } },
        stashedEffects: [],
        target: 10,
        progress: 10,
      };

      // Live system has a transient field that should be removed
      mockItem.toObject.mockReturnValue({
        name: "Project Name",
        type: "feat",
        system: {
          value: 20,
          transientField: "should be gone",
          activities: { projectAct: { name: "Project Activity" } },
        },
        flags: {},
      });

      mockItem.actor = mockActor;
      (globalThis as any).fromUuid.mockResolvedValue(null); // Force recreation from flags

      await ProjectLifecycle.completeProject(mockItem);

      const createdData = mockActor.createEmbeddedDocuments.mock.calls[0][1][0];
      expect(createdData.system.transientField).toBeUndefined();
      expect(createdData.system.value).toBe(10); // Restored from stashed value
      expect(createdData.system.activities).toEqual({ act1: { name: "Activity 1" } });
    });
  });
});
