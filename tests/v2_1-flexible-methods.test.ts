import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV2_1, migrateToV2_1_1 } from "../src/migrations/v2_1-flexible-methods";
import { MODULE_ID } from "../src/global";

describe("Migration v2.1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = { notifications: { info: vi.fn(), error: vi.fn() } };
    (global as any).game = {
      settings: {
        get: vi.fn().mockImplementation((ns, key) => {
          if (ns !== MODULE_ID) return null;
          if (key === "rules") return {};
          if (key === "projectTemplates") return [];
          if (key === "allowedCompendiums") return [];
          return null;
        }),
        set: vi.fn().mockImplementation((ns) => {
          if (ns !== MODULE_ID) return Promise.reject(new Error("Incorrect namespace"));
          return Promise.resolve(true);
        }),
      },
      actors: [],
      packs: {
        get: vi.fn(),
      },
    };
  });

  describe("Rules Migration (Method split)", () => {
    it("should migrate 'direct' method", async () => {
      vi.mocked(game.settings.get).mockImplementation((ns, key) => {
        if (key === "rules") return { method: "direct" };
        return [];
      });
      await migrateToV2_1();
      expect(game.settings.set).toHaveBeenCalledWith(
        MODULE_ID,
        "rules",
        expect.objectContaining({
          nonBulkMethod: "direct",
          bulkMethod: "direct",
        }),
      );
    });

    it("should migrate 'roll' method", async () => {
      vi.mocked(game.settings.get).mockImplementation((ns, key) => {
        if (key === "rules") return { method: "roll" };
        return [];
      });
      await migrateToV2_1();
      expect(game.settings.set).toHaveBeenCalledWith(
        MODULE_ID,
        "rules",
        expect.objectContaining({
          nonBulkMethod: "roll",
          bulkMethod: "roll",
        }),
      );
    });

    it("should migrate 'mathematical' method", async () => {
      vi.mocked(game.settings.get).mockImplementation((ns, key) => {
        if (key === "rules") return { method: "mathematical" };
        return [];
      });
      await migrateToV2_1();
      expect(game.settings.set).toHaveBeenCalledWith(
        MODULE_ID,
        "rules",
        expect.objectContaining({
          nonBulkMethod: "roll",
          bulkMethod: "mathematical",
        }),
      );
    });
  });

  describe("Operator Migration", () => {
    it("should migrate project templates in settings", async () => {
      const templates = [
        {
          id: "t1",
          requirements: [{ operator: "===" }, { operator: "!==" }, { operator: ">=" }],
        },
      ];
      vi.mocked(game.settings.get).mockImplementation((ns, key) => {
        if (key === "projectTemplates") return templates;
        return [];
      });

      await migrateToV2_1();

      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, "projectTemplates", [
        expect.objectContaining({
          requirements: [
            expect.objectContaining({ operator: "==" }),
            expect.objectContaining({ operator: "!=" }),
            expect.objectContaining({ operator: ">=" }),
          ],
        }),
      ]);
    });

    it("should migrate actor items", async () => {
      const mockItem = {
        id: "mock-id",
        getFlag: vi.fn().mockImplementation((_scope, key) => {
          if (key === "isLearningProject") return true;
          if (key === "projectData") {
            return {
              requirements: [{ operator: "===" }, { operator: "!==" }],
            };
          }
          return null;
        }),
        update: vi.fn().mockResolvedValue(true),
      };
      const mockActor = {
        items: [mockItem],
        updateEmbeddedDocuments: vi.fn().mockResolvedValue([]),
      };
      (game.actors as any).push(mockActor);

      await migrateToV2_1();

      expect(mockActor.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [
        expect.objectContaining({
          _id: "mock-id",
          "flags.thefehrs-learning-manager.projectData.requirements": [
            expect.objectContaining({ operator: "==" }),
            expect.objectContaining({ operator: "!=" }),
          ],
        }),
      ]);
    });

    it("should migrate compendium items", async () => {
      const mockItem = {
        id: "mock-id",
        getFlag: vi.fn().mockImplementation((_scope, key) => {
          if (key === "projectData") {
            return {
              requirements: [{ operator: "===" }],
            };
          }
          return null;
        }),
        update: vi.fn().mockResolvedValue(true),
      };

      const mockPack = {
        collection: "test-pack",
        metadata: { type: "Item", id: "pack1" },
        locked: true,
        configure: vi.fn().mockResolvedValue(true),
        getDocuments: vi.fn().mockResolvedValue([mockItem]),
        documentClass: {
          updateDocuments: vi.fn().mockResolvedValue([]),
        },
      };

      vi.mocked(game.packs.get).mockReturnValue(mockPack as any);
      vi.mocked(game.settings.get).mockImplementation((ns, key) => {
        if (key === "allowedCompendiums") return ["pack1"];
        return [];
      });

      await migrateToV2_1();

      expect(mockPack.configure).toHaveBeenCalledWith({ locked: false });
      expect(mockPack.documentClass.updateDocuments).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            _id: "mock-id",
            "flags.thefehrs-learning-manager.projectData.requirements": [
              expect.objectContaining({ operator: "==" }),
            ],
          }),
        ],
        { pack: "test-pack" },
      );
      expect(mockPack.configure).toHaveBeenCalledWith({ locked: true });
    });
  });

  describe("migrateToV2_1_1 (Formula Refresh)", () => {
    it("should refresh bulk formula if it matches old buggy default", async () => {
      const oldBuggyDefault = "round(@hours * (22 - max(1, @dc - @abilities.int.mod)) / 20)";
      vi.mocked(game.settings.get).mockImplementation((ns, key) => {
        if (key === "rules") return { bulkExpectedFormula: oldBuggyDefault };
        return null;
      });

      await migrateToV2_1_1();

      expect(game.settings.set).toHaveBeenCalledWith(
        MODULE_ID,
        "rules",
        expect.objectContaining({
          bulkExpectedFormula: expect.stringContaining("@tutelage"),
        }),
      );
      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, "migrationVersion", "2.1.1");
    });

    it("should not refresh formula if it does not match default, but still set version", async () => {
      vi.mocked(game.settings.get).mockImplementation((ns, key) => {
        if (key === "rules") return { bulkExpectedFormula: "custom-formula" };
        return null;
      });

      await migrateToV2_1_1();

      expect(game.settings.set).not.toHaveBeenCalledWith(MODULE_ID, "rules", expect.anything());
      expect(game.settings.set).toHaveBeenCalledWith(MODULE_ID, "migrationVersion", "2.1.1");
    });
  });
});
