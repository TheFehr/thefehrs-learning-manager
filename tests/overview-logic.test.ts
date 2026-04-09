import { describe, it, expect, vi, beforeEach } from "vitest";
import { getInvalidProjects } from "../src/apps/overview-logic.js";
import { MODULE_ID } from "../src/global.js";

describe("overview-logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock game.settings.get
    (game.settings.get as any).mockImplementation((module: string, key: string) => {
      if (module === MODULE_ID && key === "allowedCompendiums") {
        return ["pack1", "pack2"];
      }
      return [];
    });

    // Mock game.packs
    const mockPacksList = [
      {
        metadata: { id: "pack1", type: "Item", label: "Pack 1" },
        getIndex: vi.fn().mockResolvedValue([]),
        getDocument: vi.fn(),
      },
      {
        metadata: { id: "pack2", type: "Item", label: "Pack 2" },
        getIndex: vi.fn().mockResolvedValue([]),
        getDocument: vi.fn(),
      },
      {
        metadata: { id: "pack3", type: "Actor", label: "Pack 3" }, // Should be skipped
        getIndex: vi.fn().mockResolvedValue([]),
        getDocument: vi.fn(),
      },
    ];

    (game.packs.get as any).mockImplementation((id: string) =>
      mockPacksList.find((p) => p.metadata.id === id),
    );
  });

  it("should return an empty array if all projects are valid", async () => {
    const validEntry = {
      _id: "item1",
      name: "Valid Project",
      system: { description: { value: "A valid description" } },
      flags: {
        [MODULE_ID]: {
          projectData: { isLearningProject: true, target: 10 },
        },
      },
    };

    const pack1 = game.packs.get("pack1") as any;
    pack1.getIndex.mockResolvedValue([validEntry]);

    const result = await getInvalidProjects();
    expect(result).toHaveLength(0);
    expect(pack1.getDocument).not.toHaveBeenCalled();
  });

  it("should identify projects missing isLearningProject flag", async () => {
    const invalidEntry = {
      _id: "item1",
      name: "Invalid Project",
      system: { description: { value: "A valid description" } },
      flags: {
        [MODULE_ID]: {
          projectData: { target: 10 }, // Missing isLearningProject: true
        },
      },
    };

    const pack1 = game.packs.get("pack1") as any;
    pack1.getIndex.mockResolvedValue([invalidEntry]);
    pack1.getDocument.mockResolvedValue({ ...invalidEntry, getFlag: vi.fn() });

    const result = await getInvalidProjects();
    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain(
      "Missing or invalid isLearningProject flag in projectData.",
    );
    expect(pack1.getDocument).toHaveBeenCalledWith("item1");
  });

  it("should identify projects with missing or invalid target", async () => {
    const entryNoTarget = {
      _id: "item1",
      name: "No Target",
      system: { description: { value: "Desc" } },
      flags: {
        [MODULE_ID]: {
          projectData: { isLearningProject: true },
        },
      },
    };

    const entryZeroTarget = {
      _id: "item2",
      name: "Zero Target",
      system: { description: { value: "Desc" } },
      flags: {
        [MODULE_ID]: {
          projectData: { isLearningProject: true, target: 0 },
        },
      },
    };

    const pack1 = game.packs.get("pack1") as any;
    pack1.getIndex.mockResolvedValue([entryNoTarget, entryZeroTarget]);
    pack1.getDocument.mockImplementation((id: string) =>
      Promise.resolve({ id, name: id === "item1" ? "No Target" : "Zero Target" }),
    );

    const result = await getInvalidProjects();
    expect(result).toHaveLength(2);
    expect(result[0].reasons).toContain("Missing or invalid project target (must be > 0).");
    expect(result[1].reasons).toContain("Missing or invalid project target (must be > 0).");
    expect(pack1.getDocument).toHaveBeenCalledTimes(2);
  });

  it("should identify projects with missing name or description", async () => {
    const entryNoName = {
      _id: "item1",
      name: "",
      system: { description: { value: "Desc" } },
      flags: {
        [MODULE_ID]: {
          projectData: { isLearningProject: true, target: 10 },
        },
      },
    };

    const entryNoDesc = {
      _id: "item2",
      name: "Name",
      system: { description: { value: "  " } },
      flags: {
        [MODULE_ID]: {
          projectData: { isLearningProject: true, target: 10 },
        },
      },
    };

    const pack1 = game.packs.get("pack1") as any;
    pack1.getIndex.mockResolvedValue([entryNoName, entryNoDesc]);
    pack1.getDocument.mockImplementation((id: string) =>
      Promise.resolve({ id, name: id === "item1" ? "" : "Name" }),
    );

    const result = await getInvalidProjects();
    expect(result).toHaveLength(2);
    expect(result[0].reasons).toContain("Project name is missing or empty.");
    expect(result[1].reasons).toContain("Project description is missing or empty.");
  });

  it("should handle multiple invalidity reasons for a single project", async () => {
    const veryInvalidEntry = {
      _id: "item1",
      name: " ",
      system: { description: { value: "" } },
      // No flags at all
    };

    const pack1 = game.packs.get("pack1") as any;
    pack1.getIndex.mockResolvedValue([veryInvalidEntry]);
    pack1.getDocument.mockResolvedValue({ _id: "item1" });

    const result = await getInvalidProjects();
    expect(result).toHaveLength(1);
    expect(result[0].reasons).toHaveLength(4);
  });

  it("should skip compendiums that are not found or not Item type", async () => {
    // pack1 and pack2 are in allowedCompendiums. pack3 is Actor type. pack4 is not found.
    (game.settings.get as any).mockReturnValue(["pack1", "pack3", "pack4"]);

    const pack1 = game.packs.get("pack1") as any;
    pack1.getIndex.mockResolvedValue([]);

    const result = await getInvalidProjects();
    // Should only process pack1 (empty in this case)
    expect(result).toHaveLength(0);
    expect(pack1.getIndex).toHaveBeenCalled();
  });
});
