import { describe, it, expect, vi, beforeEach } from "vitest";
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

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).Actor = class MockActor {
      constructor(data: any) {
        Object.assign(this, data);
      }
    };
    (globalThis as any).Item = class MockItem {
      constructor(data: any) {
        Object.assign(this, data);
      }
      getFlag = vi.fn();
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

    mockItem.getFlag.mockReturnValue({ target: 10 });
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
        return [item];
      }),
    };
    (globalThis as any).fromUuid = vi.fn();
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
      mockItem.getFlag.mockReturnValue({ target: 0 });
      const result = await ProjectLifecycle.initiateProjectFromItem(mockActor, mockItem);

      expect(result).toBeNull();
      expect(mockActor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it("should delete created item if activity injection fails", async () => {
      (ActivityManager.injectActivities as any).mockRejectedValue(new Error("Failed"));
      const result = await ProjectLifecycle.initiateProjectFromItem(mockActor, mockItem);

      expect(result).toBeNull();
      const createdItem = (await mockActor.createEmbeddedDocuments.mock.results[0].value)[0];
      expect(createdItem.delete).toHaveBeenCalled();
    });
  });

  describe("completeProject", () => {
    it("should restore from source if available", async () => {
      mockItem.getFlag.mockReturnValue({
        stashedSourceUuid: "Item.Source",
        isLearningProject: true,
        projectData: { target: 10, progress: 10, stashedSourceUuid: "Item.Source" },
      });
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
  });
});
