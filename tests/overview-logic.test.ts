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
        getDocuments: vi.fn().mockResolvedValue([]),
      },
      {
        metadata: { id: "pack2", type: "Item", label: "Pack 2" },
        getDocuments: vi.fn().mockResolvedValue([]),
      },
      {
        metadata: { id: "pack3", type: "Actor", label: "Pack 3" }, // Should be skipped
        getDocuments: vi.fn().mockResolvedValue([]),
      },
    ];

    (game.packs.get as any).mockImplementation((id: string) =>
      mockPacksList.find((p) => p.metadata.id === id),
    );
  });

  it("should return an empty array if all projects are valid", async () => {
    const validItem = {
      name: "Valid Project",
      system: { description: { value: "A valid description" } },
      getFlag: vi.fn().mockImplementation((module, key) => {
        if (module === MODULE_ID && key === "projectData") {
          return { isLearningProject: true, target: 10 };
        }
      }),
    };

    const pack1 = game.packs.get("pack1");
    (pack1.getDocuments as any).mockResolvedValue([validItem]);

    const result = await getInvalidProjects();
    expect(result).toHaveLength(0);
  });

  it("should identify projects missing isLearningProject flag", async () => {
    const invalidItem = {
      name: "Invalid Project",
      system: { description: { value: "A valid description" } },
      getFlag: vi.fn().mockImplementation((module, key) => {
        if (module === MODULE_ID && key === "projectData") {
          return { target: 10 }; // Missing isLearningProject: true
        }
      }),
    };

    const pack1 = game.packs.get("pack1");
    (pack1.getDocuments as any).mockResolvedValue([invalidItem]);

    const result = await getInvalidProjects();
    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain(
      "Missing or invalid isLearningProject flag in projectData.",
    );
    expect(result[0].packName).toBe("Pack 1");
  });

  it("should identify projects with missing or invalid target", async () => {
    const itemNoTarget = {
      name: "No Target",
      system: { description: { value: "Desc" } },
      getFlag: vi.fn().mockImplementation((module, key) => {
        if (module === MODULE_ID && key === "projectData") {
          return { isLearningProject: true };
        }
      }),
    };

    const itemZeroTarget = {
      name: "Zero Target",
      system: { description: { value: "Desc" } },
      getFlag: vi.fn().mockImplementation((module, key) => {
        if (module === MODULE_ID && key === "projectData") {
          return { isLearningProject: true, target: 0 };
        }
      }),
    };

    const pack1 = game.packs.get("pack1");
    (pack1.getDocuments as any).mockResolvedValue([itemNoTarget, itemZeroTarget]);

    const result = await getInvalidProjects();
    expect(result).toHaveLength(2);
    expect(result[0].reasons).toContain("Missing or invalid project target (must be > 0).");
    expect(result[1].reasons).toContain("Missing or invalid project target (must be > 0).");
  });

  it("should identify projects with missing name or description", async () => {
    const itemNoName = {
      name: "",
      system: { description: { value: "Desc" } },
      getFlag: vi.fn().mockImplementation((module, key) => {
        if (module === MODULE_ID && key === "projectData") {
          return { isLearningProject: true, target: 10 };
        }
      }),
    };

    const itemNoDesc = {
      name: "Name",
      system: { description: { value: "  " } },
      getFlag: vi.fn().mockImplementation((module, key) => {
        if (module === MODULE_ID && key === "projectData") {
          return { isLearningProject: true, target: 10 };
        }
      }),
    };

    const pack1 = game.packs.get("pack1");
    (pack1.getDocuments as any).mockResolvedValue([itemNoName, itemNoDesc]);

    const result = await getInvalidProjects();
    expect(result).toHaveLength(2);
    expect(result[0].reasons).toContain("Project name is missing or empty.");
    expect(result[1].reasons).toContain("Project description is missing or empty.");
  });

  it("should handle multiple invalidity reasons for a single project", async () => {
    const veryInvalidItem = {
      name: " ",
      system: { description: { value: "" } },
      getFlag: vi.fn().mockReturnValue(null),
    };

    const pack1 = game.packs.get("pack1");
    (pack1.getDocuments as any).mockResolvedValue([veryInvalidItem]);

    const result = await getInvalidProjects();
    expect(result).toHaveLength(1);
    expect(result[0].reasons).toHaveLength(4);
  });

  it("should skip compendiums that are not found or not Item type", async () => {
    // pack1 and pack2 are in allowedCompendiums. pack3 is Actor type. pack4 is not found.
    (game.settings.get as any).mockReturnValue(["pack1", "pack3", "pack4"]);

    const result = await getInvalidProjects();
    // Should only process pack1 (empty in this case)
    expect(result).toHaveLength(0);
  });
});
