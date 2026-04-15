import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProjectLifecycle } from "../../src/logic/project-lifecycle";
import { Settings } from "../../src/core/settings";
import { ActivityManager } from "../../src/core/activity-manager";
import { ProjectUI } from "../../src/core/project-ui";

vi.mock("../../src/core/settings", () => ({
  Settings: {
    ID: "thefehrs-learning-manager",
    get: vi.fn(),
  },
}));

vi.mock("../../src/core/activity-manager", () => ({
  ActivityManager: {
    injectActivities: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("../../src/core/project-ui", () => ({
  ProjectUI: {
    generateProgressHtml: vi.fn().mockReturnValue("<div>Progress</div>"),
  },
}));

describe("ProjectLifecycle", () => {
  let mockActor: any;
  let mockItem: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (Settings.get as any).mockImplementation((key: string) => {
      if (key === "rules") return { rollMode: "gmroll" };
      return null;
    });
    mockItem = new (global as any).Item();
    mockItem.getFlag = vi.fn();
    mockItem.setFlag = vi.fn();
    mockItem.update = vi.fn().mockResolvedValue(mockItem);
    mockItem.delete = vi.fn().mockResolvedValue(true);
    mockItem.toObject = vi.fn();

    mockItem.name = "Source Item";
    mockItem.uuid = "Item.Source";
    mockItem.type = "feat";
    mockItem.system = {
      description: { value: "Description" },
      activities: {},
    };
    mockItem.getFlag.mockReturnValue({ target: 10 });
    mockItem.toObject.mockReturnValue({
      name: "Source Item",
      type: "feat",
      system: { description: { value: "Description" }, activities: {} },
      flags: {},
    });

    mockActor = {
      name: "Test Actor",
      createEmbeddedDocuments: vi.fn().mockImplementation(async () => {
        const item = new (global as any).Item();
        item.delete = vi.fn().mockResolvedValue(true);
        item.update = vi.fn().mockResolvedValue(item);
        return [item];
      }),
    };
    (global as any).fromUuid = vi.fn();
  });

  describe("initiateProjectFromItem", () => {
    it("should successfully initiate a project", async () => {
      const result = await ProjectLifecycle.initiateProjectFromItem(mockActor, mockItem);

      expect(result).toBeDefined();
      expect(mockActor.createEmbeddedDocuments).toHaveBeenCalled();
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
      const mockSourceItem = new (global as any).Item();
      mockSourceItem.toObject = vi.fn().mockReturnValue({ name: "Source" });
      (global as any).fromUuid.mockResolvedValue(mockSourceItem);
      mockItem.actor = mockActor;

      await ProjectLifecycle.completeProject(mockItem);

      expect(mockActor.createEmbeddedDocuments).toHaveBeenCalled();
      expect(mockItem.delete).toHaveBeenCalled();
    });
  });
});
