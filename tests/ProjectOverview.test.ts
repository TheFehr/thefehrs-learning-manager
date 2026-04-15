import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ProjectOverview from "@/apps/overview/ProjectOverview.svelte";
import { mount, unmount, tick } from "svelte";
import * as overviewLogic from "@/apps/overview-logic.js";

vi.mock("@/apps/overview-logic.js", () => ({
  getInvalidProjects: vi.fn(),
}));

vi.unmock("svelte");

async function waitForIdle(target: HTMLElement) {
  await vi.waitFor(
    () => {
      const isLoading = target.querySelector(".loading-state") !== null;
      const isRefreshing = (target.querySelector("button.refresh-button") as HTMLButtonElement)
        ?.disabled;
      if (isLoading || isRefreshing) {
        throw new Error("Still loading or refreshing");
      }
    },
    { timeout: 2000, interval: 50 },
  );
}

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
    await waitForIdle(target);

    expect(target.innerHTML).toContain("All projects are valid!");
  });

  it("should show error state if fetching projects fails", async () => {
    (overviewLogic.getInvalidProjects as any).mockRejectedValue(new Error("Network Error"));
    instance = mount(ProjectOverview, { target });
    await waitForIdle(target);

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
    await waitForIdle(target);

    expect(target.innerHTML).toContain("Broken Project");
    expect(target.innerHTML).toContain("Test Pack");
    expect(target.innerHTML).toContain("Reason 1");
    expect(target.innerHTML).toContain("Reason 2");
  });

  it("should call item.sheet.render when pressing Enter or Space on the project name", async () => {
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
    await waitForIdle(target);

    const projectName = target.querySelector(".project-name") as HTMLElement;
    expect(projectName).not.toBeNull();

    // Enter
    projectName.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await tick();
    expect(renderSpy).toHaveBeenCalledWith(true);

    // Space
    renderSpy.mockClear();
    projectName.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    await tick();
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
    await waitForIdle(target);

    const fixButton = target.querySelector("button.fix-button") as HTMLButtonElement;
    expect(fixButton).not.toBeNull();
    fixButton.click();

    expect(renderSpy).toHaveBeenCalledWith(true);
  });

  it("should refresh invalid projects when clicking the refresh button", async () => {
    const mockInvalidProjects1 = [
      {
        item: { name: "Broken Project 1", sheet: { render: vi.fn() } },
        packName: "Test Pack",
        reasons: ["Reason 1"],
      },
    ];
    const mockInvalidProjects2 = [
      {
        item: { name: "Broken Project 2", sheet: { render: vi.fn() } },
        packName: "Test Pack",
        reasons: ["Reason 2"],
      },
    ];

    (overviewLogic.getInvalidProjects as any).mockResolvedValueOnce(mockInvalidProjects1);
    (overviewLogic.getInvalidProjects as any).mockResolvedValueOnce(mockInvalidProjects2);

    instance = mount(ProjectOverview, { target });
    await waitForIdle(target);

    expect(target.innerHTML).toContain("Broken Project 1");

    const refreshButton = target.querySelector("button.refresh-button") as HTMLButtonElement;
    expect(refreshButton).not.toBeNull();
    refreshButton.click();

    await waitForIdle(target);
    await tick();

    expect(target.innerHTML).toContain("Broken Project 2");
  });
});
