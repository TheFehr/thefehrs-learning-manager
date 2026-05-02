import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV4_2 } from "@/migrations/v4_2-multi-child.js";
import { MODULE_ID } from "@/global.js";

describe("v4.2.0 Multi-child Migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).game = {
      actors: {
        contents: [],
      },
      settings: {
        get: vi.fn(),
        set: vi.fn(),
      },
      packs: {
        get: vi.fn(),
      },
    };
  });

  it("should migrate projectData.followUpProjectId to followUpProjectIds array on world actors", async () => {
    const mockItem = {
      name: "Test Project",
      uuid: "item-uuid",
      getFlag: vi.fn().mockImplementation((scope, key) => {
        if (scope === MODULE_ID && key === "isLearningProject") return true;
        if (scope === MODULE_ID && key === "projectData") {
          return { followUpProjectId: "child-uuid" };
        }
        return undefined;
      }),
      update: vi.fn().mockResolvedValue(true),
    };

    const mockActor = {
      items: [mockItem],
    };

    (global as any).game.actors.contents = [mockActor];
    vi.mocked((global as any).game.settings.get).mockReturnValue([]); // No compendiums

    await migrateToV4_2();

    expect(mockItem.update).toHaveBeenCalledWith({
      [`flags.${MODULE_ID}.projectData.followUpProjectIds`]: ["child-uuid"],
      [`flags.${MODULE_ID}.projectData.followUpProjectId`]: "",
    });
    expect((global as any).game.settings.set).toHaveBeenCalledWith(
      MODULE_ID,
      "migrationVersion",
      "4.2.0",
    );
  });

  it("should migrate projectData.followUpProjectId on compendium items", async () => {
    const mockItem = {
      name: "Compendium Project",
      uuid: "comp-uuid",
      getFlag: vi.fn().mockImplementation((scope, key) => {
        if (scope === MODULE_ID && key === "isLearningProject") return true;
        if (scope === MODULE_ID && key === "projectData") {
          return { followUpProjectId: "child-uuid" };
        }
        return undefined;
      }),
      update: vi.fn().mockResolvedValue(true),
    };

    const mockPack = {
      locked: false,
      getDocuments: vi.fn().mockResolvedValue([mockItem]),
    };

    vi.mocked((global as any).game.settings.get).mockReturnValue(["world.pack1"]);
    vi.mocked((global as any).game.packs.get).mockReturnValue(mockPack);

    await migrateToV4_2();

    expect(mockItem.update).toHaveBeenCalledWith({
      [`flags.${MODULE_ID}.projectData.followUpProjectIds`]: ["child-uuid"],
      [`flags.${MODULE_ID}.projectData.followUpProjectId`]: "",
    });
  });

  it("should not migrate if followUpProjectIds already exists", async () => {
    const mockItem = {
      name: "Modern Project",
      uuid: "modern-uuid",
      getFlag: vi.fn().mockImplementation((scope, key) => {
        if (scope === MODULE_ID && key === "isLearningProject") return true;
        if (scope === MODULE_ID && key === "projectData") {
          return {
            followUpProjectId: "old-uuid",
            followUpProjectIds: ["new-uuid"],
          };
        }
        return undefined;
      }),
      update: vi.fn(),
    };

    const mockActor = { items: [mockItem] };
    (global as any).game.actors.contents = [mockActor];

    await migrateToV4_2();

    expect(mockItem.update).not.toHaveBeenCalled();
  });
});
