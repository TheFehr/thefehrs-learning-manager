import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProjectOverviewApp } from "../../src/apps/overview-app.js";
import { mount, unmount } from "svelte";

// Mock svelte
vi.mock("svelte", async (importOriginal) => {
  const actual = await importOriginal<typeof import("svelte")>();
  return {
    ...actual,
    mount: vi.fn().mockReturnValue({}),
    unmount: vi.fn(),
  };
});

describe("ProjectOverviewApp", () => {
  let app: ProjectOverviewApp;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new ProjectOverviewApp();
  });

  afterEach(async () => {
    if (app) {
      try {
        await app.close();
      } catch (e) {
        // ignore already closed
      }
    }
  });

  it("should have correct default options", () => {
    const options = (ProjectOverviewApp as any).DEFAULT_OPTIONS;
    expect(options.id).toBe("learning-manager-project-overview");
    expect(options.window.title).toBe("Learning Manager: Project Overview");
  });

  it("should mount svelte component on _onRender", async () => {
    const context = {};
    const options = {};

    // @ts-expect-error - accessing protected method for testing
    await app._onRender(context, options);

    expect(mount).toHaveBeenCalled();
  });

  it("should unmount svelte component on close", async () => {
    const context = {};
    const options = {};

    // @ts-expect-error - accessing protected method for testing
    await app._onRender(context, options);

    await app.close();

    expect(unmount).toHaveBeenCalled();
  });

  it("should unmount existing svelte component if _onRender is called again", async () => {
    const context = {};
    const options = {};

    // @ts-expect-error - accessing protected method for testing
    await app._onRender(context, options);
    // @ts-expect-error - accessing protected method for testing
    await app._onRender(context, options);

    expect(unmount).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledTimes(2);
  });
});
