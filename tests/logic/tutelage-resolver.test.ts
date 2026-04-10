import { describe, it, expect, vi, beforeEach } from "vitest";
import { TutelageResolverService } from "../../src/logic/tutelage-resolver";
import { MODULE_ID } from "../../src/global";

describe("TutelageResolverService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).game = {
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
              [`flags.${MODULE_ID}.teacherOfferings`]: [
                { name: "Lesson 1", modifier: 5, categories: ["magic"] },
              ],
            },
          ]),
        }),
      },
    };
    (global as any).foundry = {
      utils: {
        getProperty: vi.fn((obj, path) => {
          return obj[path];
        }),
      },
    };

    TutelageResolverService.clearCache();
  });

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
        [`flags.${MODULE_ID}.teacherOfferings`]: [
          { name: "Lesson", modifier: 2, projectUuids: [], categories: [] },
        ],
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
});
