import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ProjectTreeView from "@/apps/components/ProjectTreeView.svelte";
import { TreeLogic } from "@/logic/tree-logic.js";
import { mount, unmount, tick } from "svelte";

vi.unmock("svelte");

// Mock TreeLogic
vi.mock("@/logic/tree-logic.js", () => ({
  TreeLogic: {
    buildProjectTree: vi.fn(),
  },
}));

vi.mock("@/core/logger.js", () => ({
  Logger: {
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock projectData since it's used in ProjectTreeNode
vi.mock("@/logic/project-item.js", () => ({
  projectData: vi.fn().mockReturnValue({ target: 100 }),
}));

describe("ProjectTreeView.svelte", () => {
  let target: HTMLElement;
  let instance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (instance) unmount(instance);
    instance = undefined;
    target.remove();
  });

  it("should show loading state initially", async () => {
    // Make buildProjectTree hang or return a promise we control
    let resolveTree: (value: any[]) => void;
    const treePromise = new Promise<any[]>((resolve) => {
      resolveTree = resolve;
    });
    vi.mocked(TreeLogic.buildProjectTree).mockReturnValue(treePromise);

    instance = mount(ProjectTreeView, { target });
    await tick();

    expect(target.textContent).toContain("Loading tree structure...");

    // Cleanup
    resolveTree!([]);
  });

  it("should render tree nodes when loaded", async () => {
    const mockForest = [
      {
        uuid: "root1",
        name: "Root Project",
        img: "root.png",
        item: { sheet: { render: vi.fn() } },
        children: [
          {
            uuid: "child1",
            name: "Child Project",
            img: "child.png",
            item: { sheet: { render: vi.fn() } },
            children: [],
            parentId: "root1",
            depth: 1,
          },
        ],
        parentId: null,
        depth: 0,
      },
    ];

    vi.mocked(TreeLogic.buildProjectTree).mockResolvedValue(mockForest as any);

    instance = mount(ProjectTreeView, { target });

    // Need multiple ticks for onMount and async loadTree
    await tick();
    await tick();
    await tick();

    expect(target.textContent).toContain("Root Project");
    expect(target.textContent).toContain("Child Project");
  });

  it("should filter nodes based on search query", async () => {
    const mockForest = [
      {
        uuid: "a",
        name: "Apple",
        img: "apple.png",
        item: {},
        children: [],
        parentId: null,
        depth: 0,
      },
      {
        uuid: "b",
        name: "Banana",
        img: "banana.png",
        item: {},
        children: [],
        parentId: null,
        depth: 0,
      },
    ];

    vi.mocked(TreeLogic.buildProjectTree).mockResolvedValue(mockForest as any);

    instance = mount(ProjectTreeView, { target, props: { searchQuery: "app" } });
    await tick();
    await tick();
    await tick();

    expect(target.textContent).toContain("Apple");
    expect(target.textContent).not.toContain("Banana");
  });

  it("should show empty state when no projects found", async () => {
    vi.mocked(TreeLogic.buildProjectTree).mockResolvedValue([]);

    instance = mount(ProjectTreeView, { target });
    await tick();
    await tick();
    await tick();

    expect(target.textContent).toContain("No projects found in allowed compendiums.");
  });

  it("should show error message on failure", async () => {
    vi.mocked(TreeLogic.buildProjectTree).mockRejectedValue(new Error("Fetch failed"));

    instance = mount(ProjectTreeView, { target });
    await tick();
    await tick();
    await tick();

    expect(target.textContent).toContain("Failed to load project tree.");
  });
});
