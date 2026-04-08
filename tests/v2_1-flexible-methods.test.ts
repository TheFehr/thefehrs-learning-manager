import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV2_1, migrateToV2_1_1 } from "../src/migrations/v2_1-flexible-methods";
import { Settings } from "../src/core/settings";

vi.mock("../src/core/settings", () => ({
  Settings: {
    ID: "thefehrs-learning-manager",
    get: vi.fn(),
    set: vi.fn(),
    allowedCompendiums: [],
  },
}));

describe("Migration v2.1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Settings.get).mockReturnValue({}); // Default rules
    (global as any).ui = { notifications: { info: vi.fn(), error: vi.fn() } };
    (global as any).game = {
      settings: {
        get: vi.fn(),
        set: vi.fn(),
      },
      actors: [],
      packs: {
        get: vi.fn(),
      },
    };
  });

  describe("Rules Migration (Method split)", () => {
    it("should migrate 'direct' method", async () => {
      vi.mocked(Settings.get).mockReturnValue({ method: "direct" });
      await migrateToV2_1();
      expect(Settings.set).toHaveBeenCalledWith(
        "rules",
        expect.objectContaining({
          nonBulkMethod: "direct",
          bulkMethod: "direct",
        }),
      );
    });

    it("should migrate 'roll' method", async () => {
      vi.mocked(Settings.get).mockReturnValue({ method: "roll" });
      await migrateToV2_1();
      expect(Settings.set).toHaveBeenCalledWith(
        "rules",
        expect.objectContaining({
          nonBulkMethod: "roll",
          bulkMethod: "roll",
        }),
      );
    });

    it("should migrate 'mathematical' method", async () => {
      vi.mocked(Settings.get).mockReturnValue({ method: "mathematical" });
      await migrateToV2_1();
      expect(Settings.set).toHaveBeenCalledWith(
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
      vi.mocked(game.settings.get).mockReturnValue(templates);

      await migrateToV2_1();

      expect(game.settings.set).toHaveBeenCalledWith(
        "thefehrs-learning-manager",
        "projectTemplates",
        [
          expect.objectContaining({
            requirements: [
              expect.objectContaining({ operator: "==" }),
              expect.objectContaining({ operator: "!=" }),
              expect.objectContaining({ operator: ">=" }),
            ],
          }),
        ],
      );
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
        metadata: { type: "Item" },
        locked: true,
        configure: vi.fn().mockResolvedValue(true),
        getDocuments: vi.fn().mockResolvedValue([mockItem]),
        documentClass: {
          updateDocuments: vi.fn().mockResolvedValue([]),
        },
      };

      vi.mocked(game.packs.get).mockReturnValue(mockPack as any);
      (Settings as any).allowedCompendiums = ["pack1"];

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
      vi.mocked(Settings.get).mockReturnValue({ bulkExpectedFormula: oldBuggyDefault });

      await migrateToV2_1_1();

      expect(Settings.set).toHaveBeenCalledWith(
        "rules",
        expect.objectContaining({
          bulkExpectedFormula: expect.stringContaining("@tutelage"),
        }),
      );
      expect(Settings.set).toHaveBeenCalledWith("migrationVersion", "2.1.1");
    });

    it("should not refresh formula if it does not match default, but still set version", async () => {
      vi.mocked(Settings.get).mockReturnValue({ bulkExpectedFormula: "custom-formula" });

      await migrateToV2_1_1();

      expect(Settings.set).not.toHaveBeenCalledWith("rules", expect.anything());
      expect(Settings.set).toHaveBeenCalledWith("migrationVersion", "2.1.1");
    });
  });
});
