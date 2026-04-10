import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { createProjectItemFromTemplate } from "../../src/migrations/migration-utils";

describe("migration-utils", () => {
  let errorSpy: MockInstance;
  let warnSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = { notifications: { error: vi.fn(), warn: vi.fn() } };
    global.fromUuid = vi.fn();
    global.Item = class {
      constructor(public data: any) {}
      static name = "Item";
      toObject = vi.fn();
    } as any;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).ui;
    delete (global as any).fromUuid;
    delete (global as any).Item;
  });

  it("should successfully create a project item from template", async () => {
    const mockTemplateItem = new (global.Item as any)({});
    mockTemplateItem.name = "Template Item";
    mockTemplateItem.uuid = "template-uuid";
    mockTemplateItem.toObject.mockReturnValue({ system: { activities: {} }, type: "feat" });

    vi.mocked(global.fromUuid).mockResolvedValue(mockTemplateItem as any);

    const mockCreatedItem = {
      id: "new-item-id",
      name: "New Item",
      system: { activities: [] },
      getFlag: vi.fn().mockReturnValue({ target: 10 }),
      update: vi.fn().mockResolvedValue(true),
    };
    const actor = {
      name: "Actor",
      createEmbeddedDocuments: vi.fn().mockResolvedValue([mockCreatedItem]),
    };

    const projectData = { id: "p1", name: "Project", templateId: "t1" };
    const result = await createProjectItemFromTemplate(
      actor as any,
      "template-uuid",
      projectData as any,
      10,
    );

    expect(result).toBe(mockCreatedItem);
    expect(global.fromUuid).toHaveBeenCalledWith("template-uuid");
    expect(mockTemplateItem.toObject).toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
      expect.objectContaining({
        name: "Project (0/10)",
        type: "feat",
      }),
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("should return null if createEmbeddedDocuments fails", async () => {
    const mockTemplateItem = {
      name: "Template Item",
      uuid: "template-uuid",
      toObject: vi.fn().mockReturnValue({ system: { activities: {} }, type: "feat" }),
    };
    vi.mocked(global.fromUuid).mockResolvedValue(mockTemplateItem as any);
    const actor = { createEmbeddedDocuments: vi.fn().mockResolvedValue([]) };

    const result = await createProjectItemFromTemplate(actor as any, "uuid", {} as any, 10);
    expect(result).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    // It's expected to warn when project item activities/rewards cannot be resolved
    expect(warnSpy).toHaveBeenCalled();
  });

  it("should handle fromUuid exception gracefully by warning", async () => {
    vi.mocked(global.fromUuid).mockRejectedValue(new Error("Database error"));
    const actor = { name: "Actor", createEmbeddedDocuments: vi.fn().mockResolvedValue([]) };

    const result = await createProjectItemFromTemplate(actor as any, "uuid", {} as any, 10);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("fromUuid failed"),
      expect.any(Error),
    );
  });
});
