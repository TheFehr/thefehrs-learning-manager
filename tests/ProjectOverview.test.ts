import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ProjectOverview from "../src/apps/overview/ProjectOverview.svelte";
import { mount, unmount, tick } from "svelte";
import * as overviewLogic from "../src/apps/overview-logic.js";

vi.unmock("svelte");

vi.mock("../src/apps/overview-logic.js", () => ({
  getInvalidProjects: vi.fn(),
}));

describe("ProjectOverview.svelte", () => {
  let instance: any;
  let target: HTMLElement;

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
    (overviewLogic.getInvalidProjects as any).mockReturnValue(new Promise(() => {})); // Never resolves
    instance = mount(ProjectOverview, { target });

    expect(target.innerHTML).toContain("Loading invalid projects...");
  });

  it("should show empty state if no invalid projects found", async () => {
    (overviewLogic.getInvalidProjects as any).mockResolvedValue([]);
    instance = mount(ProjectOverview, { target });
    // Multiple ticks ensure all async onMount logic and reactive updates are settled
    await tick();
    await tick();

    expect(target.innerHTML).toContain("All projects are valid!");
  });

  it("should show error state if fetching projects fails", async () => {
    (overviewLogic.getInvalidProjects as any).mockRejectedValue(new Error("Network Error"));
    instance = mount(ProjectOverview, { target });
    // Multiple ticks ensure all async onMount logic and reactive updates are settled
    await tick();
    await tick();

    expect(target.innerHTML).toContain("Failed to load invalid projects");
  });

  it("should render invalid projects with reasons", async () => {
    const mockInvalidProjects = [
      {
        item: { name: "Broken Project", sheet: { render: vi.fn() } },
        packName: "Test Pack",
        reasons: ["Reason 1", "Reason 2"],
      },
    ];
    (overviewLogic.getInvalidProjects as any).mockResolvedValue(mockInvalidProjects);

    instance = mount(ProjectOverview, { target });
    // Multiple ticks ensure all async onMount logic and reactive updates are settled
    await tick();
    await tick();

    expect(target.innerHTML).toContain("Broken Project");
    expect(target.innerHTML).toContain("Test Pack");
    expect(target.innerHTML).toContain("Reason 1");
    expect(target.innerHTML).toContain("Reason 2");
  });

  it("should call item.sheet.render when clicking the project name", async () => {
    const renderSpy = vi.fn();
    const mockInvalidProjects = [
      {
        item: { name: "Broken Project", sheet: { render: renderSpy } },
        packName: "Test Pack",
        reasons: ["Reason 1"],
      },
    ];
    (overviewLogic.getInvalidProjects as any).mockResolvedValue(mockInvalidProjects);

    instance = mount(ProjectOverview, { target });
    // Multiple ticks ensure all async onMount logic and reactive updates are settled
    await tick();
    await tick();

    const projectName = target.querySelector(".project-name") as HTMLElement;
    projectName.click();

    expect(renderSpy).toHaveBeenCalledWith(true);
  });

  it("should call item.sheet.render when clicking the fix button", async () => {
    const renderSpy = vi.fn();
    const mockInvalidProjects = [
      {
        item: { name: "Broken Project", sheet: { render: renderSpy } },
        packName: "Test Pack",
        reasons: ["Reason 1"],
      },
    ];
    (overviewLogic.getInvalidProjects as any).mockResolvedValue(mockInvalidProjects);

    instance = mount(ProjectOverview, { target });
    // Multiple ticks ensure all async onMount logic and reactive updates are settled
    await tick();
    await tick();

    const fixButton = target.querySelector("button.tidy-button") as HTMLButtonElement;
    fixButton.click();

    expect(renderSpy).toHaveBeenCalledWith(true);
  });
});
