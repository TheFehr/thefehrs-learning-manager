import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TutelageResolverService } from "@/logic/tutelage-resolver";
import { MODULE_ID } from "@/global";

describe("TutelageResolverService", () => {
  const _origGame = (globalThis as any).game;
  const _origFoundry = (globalThis as any).foundry;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).game = {
      settings: {
        get: vi.fn().mockImplementation((_scope, key) => {
          if (key === "teacherCompendiums") return ["pack1"];
          if (key === "bookCompendiums") return [];
          return null;
        }),
      },
      packs: {
        get: vi.fn().mockReturnValue({
          metadata: { type: "Actor" },
          getIndex: vi.fn().mockResolvedValue([
            {
              _id: "actor1",
              name: "Instructor 1",
              uuid: "Compendium.pack1.Actor.actor1",
              flags: {
                [MODULE_ID]: {
                  teacherOfferings: [{ name: "Lesson 1", modifier: 5, categories: ["magic"] }],
                },
              },
            },
          ]),
        }),
      },
    };
    (globalThis as any).foundry = {
      utils: {
        getProperty: vi.fn((obj: any, path: string) => {
          return path.split(".").reduce((o, i) => (o ? o[i] : undefined), obj);
        }),
      },
    };

    TutelageResolverService.clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
    TutelageResolverService.clearCache();
    (globalThis as any).game = _origGame;
    (globalThis as any).foundry = _origFoundry;
  });

  describe("refreshCache", () => {
    it("should isolate failing compendiums during refreshCache", async () => {
      // Setup: two compendiums, the first one will throw an error
      (game.settings.get as any).mockImplementation((_scope: string, key: string) => {
        if (key === "teacherCompendiums") return ["fail-pack", "success-pack"];
        return [];
      });

      const successPack = {
        metadata: { type: "Actor", id: "success-pack" },
        getIndex: vi.fn().mockResolvedValue([
          {
            _id: "actor1",
            name: "Good Teacher",
            uuid: "Compendium.success-pack.Actor.actor1",
            flags: {
              [MODULE_ID]: {
                teacherOfferings: [{ name: "Lesson", modifier: 5, categories: [] }],
              },
            },
          },
        ]),
      };

      const failPack = {
        metadata: { type: "Actor", id: "fail-pack" },
        getIndex: vi.fn().mockRejectedValue(new Error("Index failure")),
      };

      (game.packs.get as any).mockImplementation((id: string) => {
        if (id === "fail-pack") return failPack;
        if (id === "success-pack") return successPack;
        return null;
      });

      // Execute
      await TutelageResolverService.refreshCache();

      // Verify
      const cache = TutelageResolverService.getCache();
      expect(cache).toHaveLength(1);
      expect(cache[0].name).toBe("Good Teacher");
    });

    it("should skip non-actor compendiums", async () => {
      (game.settings.get as any).mockImplementation((_scope: string, key: string) => {
        if (key === "teacherCompendiums") return ["item-pack"];
        return [];
      });

      const itemPack = {
        metadata: { type: "Item" },
      };

      (game.packs.get as any).mockReturnValue(itemPack);

      await TutelageResolverService.refreshCache();

      expect(TutelageResolverService.getCache()).toHaveLength(0);
    });
  });

  describe("getAvailableInstructors", () => {
    it("should match instructor by category", async () => {
      const project = {
        uuid: "item1",
        name: "Project 1",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (scope === MODULE_ID && key === "projectData") return { categories: ["magic"] };
          return null;
        }),
      } as any;

      const instructors = await TutelageResolverService.getAvailableInstructors(project);
      expect(instructors).toHaveLength(1);
      expect(instructors[0].name).toBe("Instructor 1");
    });

    it("should NOT match instructor with different category", async () => {
      const project = {
        uuid: "item1",
        name: "Project 1",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (scope === MODULE_ID && key === "projectData") return { categories: ["physical"] };
          return null;
        }),
      } as any;

      const instructors = await TutelageResolverService.getAvailableInstructors(project);
      expect(instructors).toHaveLength(0);
    });

    it("should match instructor with no categories (match all)", async () => {
      (game.packs.get("pack1") as any).getIndex.mockResolvedValue([
        {
          _id: "actor2",
          name: "Universal Teacher",
          uuid: "Compendium.pack1.Actor.actor2",
          flags: {
            [MODULE_ID]: {
              teacherOfferings: [{ name: "Lesson", modifier: 2, categories: [] }],
            },
          },
        },
      ]);

      const project = {
        uuid: "item1",
        name: "Project 1",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (scope === MODULE_ID && key === "projectData") return { categories: ["magic"] };
          return null;
        }),
      } as any;

      const instructors = await TutelageResolverService.getAvailableInstructors(project);
      expect(instructors).toHaveLength(1);
    });

    it("should return cached instructors if available", async () => {
      const project = { getFlag: vi.fn().mockReturnValue({ categories: ["magic"] }) } as any;
      await TutelageResolverService.getAvailableInstructors(project);

      const packsGet = game.packs.get as any;
      packsGet.mockClear();
      await TutelageResolverService.getAvailableInstructors(project);
      expect(packsGet).not.toHaveBeenCalled();
    });
  });

  describe("getAvailableBooks", () => {
    it("should return available books with detailed info", () => {
      const project = {
        uuid: "item1",
        name: "Project 1",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (scope === MODULE_ID && key === "projectData") return { categories: ["magic"] };
          return null;
        }),
      } as any;

      const actor = {
        items: [
          {
            name: "Spellbook",
            getFlag: vi.fn().mockImplementation((scope, key) => {
              if (scope === MODULE_ID && key === "learningBookBonus") {
                return { modifier: 2, categories: ["magic"] };
              }
              if (scope === "core" && key === "sourceId") return "compendium.item1";
              return null;
            }),
          },
          {
            name: "Old Scroll",
            getFlag: vi.fn().mockImplementation((scope, key) => {
              if (scope === MODULE_ID && key === "learningBookBonus") {
                return { modifier: 1, categories: ["physical"] };
              }
              return null;
            }),
          },
        ],
      } as any;

      const books = TutelageResolverService.getAvailableBooks(actor, project);
      expect(books).toHaveLength(1);
      expect(books[0].name).toBe("Spellbook");
      expect(books[0].modifier).toBe(2);
    });

    it("should filter books by compendium if configured", () => {
      (game.settings.get as any).mockImplementation((_scope, key) => {
        if (key === "bookCompendiums") return ["my.pack", "modern.pack"];
        return [];
      });

      const project = { getFlag: vi.fn().mockReturnValue({ categories: [] }) } as any;
      const actor = {
        items: [
          {
            name: "Legacy Allowed Book",
            getFlag: vi.fn().mockImplementation((scope, key) => {
              if (scope === MODULE_ID && key === "learningBookBonus") return { modifier: 2 };
              if (scope === "core" && key === "sourceId") return "Compendium.my.pack.item1";
              return null;
            }),
          },
          {
            name: "Modern Allowed Book",
            _stats: { compendiumSource: "Compendium.modern.pack.item3" },
            getFlag: vi.fn().mockImplementation((scope, key) => {
              if (scope === MODULE_ID && key === "learningBookBonus") return { modifier: 3 };
              return null;
            }),
          },
          {
            name: "Forbidden Book",
            getFlag: vi.fn().mockImplementation((scope, key) => {
              if (scope === MODULE_ID && key === "learningBookBonus") return { modifier: 5 };
              if (scope === "core" && key === "sourceId") return "Compendium.other.pack.item2";
              return null;
            }),
          },
        ],
      } as any;

      const books = TutelageResolverService.getAvailableBooks(actor, project);
      expect(books).toHaveLength(2);
      expect(books.some((b) => b.name === "Legacy Allowed Book")).toBe(true);
      expect(books.some((b) => b.name === "Modern Allowed Book")).toBe(true);
    });
  });

  describe("getCache", () => {
    it("should return the current instructor cache", async () => {
      const project = { getFlag: vi.fn().mockReturnValue({ categories: ["magic"] }) } as any;
      await TutelageResolverService.getAvailableInstructors(project);
      const cache = TutelageResolverService.getCache();
      expect(cache).not.toBeNull();
      expect(cache).toHaveLength(1);
    });
  });

  describe("resolveTutelage", () => {
    it("should resolve self-study if no instructor selected", async () => {
      const actor = { items: [] } as any;
      const project = { getFlag: vi.fn().mockReturnValue({ categories: [] }) } as any;
      const result = await TutelageResolverService.resolveTutelage(actor, project);
      expect(result.modifier).toBe(0);
      expect(result.instructorName).toBe("Self-Study");
    });

    it("should resolve with instructor if selected", async () => {
      const actor = { items: [] } as any;
      const project = {
        name: "Test",
        getFlag: vi.fn().mockReturnValue({ categories: ["magic"] }),
      } as any;

      const result = await TutelageResolverService.resolveTutelage(
        actor,
        project,
        "Compendium.pack1.Actor.actor1",
        "Lesson 1",
      );

      expect(result.modifier).toBe(5);
      expect(result.instructorName).toBe("Lesson 1");
    });

    it("should use best modifier between book and instructor", async () => {
      const actor = {
        items: [
          {
            name: "Super Book",
            getFlag: vi.fn().mockImplementation((scope, key) => {
              if (scope === MODULE_ID && key === "learningBookBonus")
                return { modifier: 10, categories: [] };
              return null;
            }),
          },
        ],
      } as any;
      const project = { getFlag: vi.fn().mockReturnValue({ categories: [] }) } as any;

      const result = await TutelageResolverService.resolveTutelage(
        actor,
        project,
        "Compendium.pack1.Actor.actor1",
        "Lesson 1",
      );

      expect(result.modifier).toBe(10); // Book (10) > Instructor (5)
    });

    it("should NOT resolve with instructor if instructor is no longer applicable for project categories", async () => {
      const actor = { items: [] } as any;
      // Project is "physical", but Instructor 1 only supports "magic"
      const project = {
        name: "Test",
        getFlag: vi.fn().mockImplementation((scope, key) => {
          if (scope === MODULE_ID && key === "projectData") return { categories: ["physical"] };
          return null;
        }),
      } as any;

      const result = await TutelageResolverService.resolveTutelage(
        actor,
        project,
        "Compendium.pack1.Actor.actor1",
        "Lesson 1",
      );

      expect(result.modifier).toBe(0);
      expect(result.instructorName).toBe("Self-Study");
    });
  });
});
