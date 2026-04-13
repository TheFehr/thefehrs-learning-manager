import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { migrateToV1Relational } from "../../src/migrations/v1-relational";
import { MODULE_ID } from "../../src/global";

describe("Migration v1 (Relational)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = { notifications: { info: vi.fn() } };
    (global as any).game = {
      actors: { contents: [] },
      settings: { get: vi.fn().mockReturnValue([]), set: vi.fn().mockResolvedValue(true) },
    };
    (global as any).foundry = (global as any).foundry || {};
    (global as any).foundry.utils = (global as any).foundry.utils || {};
    (global as any).foundry.utils.randomID = vi.fn().mockReturnValue("rand123");
  });

  afterEach(() => {
    delete (global as any).ui;
    delete (global as any).game;
    delete (global as any).foundry;
  });

  it("should migrate projects without templateId", async () => {
    const mockProject = {
      name: "Legacy Project",
      maxProgress: 50,
      rewardUuid: "uuid",
      rewardType: "item",
      requirements: [],
    };
    const mockActor = {
      name: "Actor",
      getFlag: vi.fn().mockReturnValue([mockProject]),
      setFlag: vi.fn().mockResolvedValue(true),
    };
    (global as any).game.actors.contents = [mockActor as any];

    await migrateToV1Relational();

    expect(mockActor.setFlag).toHaveBeenCalledWith(
      MODULE_ID,
      "projects",
      expect.arrayContaining([
        expect.objectContaining({
          name: "Legacy Project",
          maxProgress: 50,
          templateId: "rand123",
        }),
      ]),
    );
    expect((global as any).game.settings.set).toHaveBeenCalledWith(
      MODULE_ID,
      "projectTemplates",
      expect.arrayContaining([
        expect.objectContaining({
          id: "rand123",
          name: "Legacy Project",
          target: 50,
        }),
      ]),
    );
  });

  it("should handle actors with empty projects array", async () => {
    const mockActor = {
      name: "Empty Actor",
      getFlag: vi.fn().mockReturnValue([]),
      setFlag: vi.fn(),
    };
    (global as any).game.actors.contents = [mockActor as any];

    await migrateToV1Relational();

    expect(mockActor.setFlag).not.toHaveBeenCalled();
  });

  it("should not create a new template if project already has a templateId", async () => {
    const mockProject = {
      name: "Existing Project",
      templateId: "existing123",
      maxProgress: 50,
    };
    const mockActor = {
      name: "Actor",
      getFlag: vi.fn().mockReturnValue([mockProject]),
      setFlag: vi.fn().mockResolvedValue(true),
    };
    (global as any).game.actors.contents = [mockActor as any];

    await migrateToV1Relational();

    expect(mockActor.setFlag).toHaveBeenCalledWith(
      MODULE_ID,
      "projects",
      expect.arrayContaining([
        expect.objectContaining({
          templateId: "existing123",
        }),
      ]),
    );
    expect((global as any).game.settings.set).not.toHaveBeenCalledWith(
      MODULE_ID,
      "projectTemplates",
      expect.any(Array),
    );
  });

  it.each([null, undefined])("should handle actors with %s projects flag", async (flagValue) => {
    const mockActor = {
      name: "Mock Actor",
      getFlag: vi.fn().mockReturnValue(flagValue),
      setFlag: vi.fn(),
    };
    (global as any).game.actors.contents = [mockActor as any];

    await migrateToV1Relational();

    expect(mockActor.setFlag).not.toHaveBeenCalled();
  });
});
