import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock migrateData to avoid running actual migrations
vi.mock("../src/migrations/migration.js", () => ({
  migrateData: vi.fn().mockResolvedValue(undefined),
}));

describe("main.ts side effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should register init and ready hooks", async () => {
    // Re-import LearningManager after resetModules to get the fresh reference
    const { LearningManager } = await import("../src/LearningManager");

    // Spy on LearningManager methods
    const initSpy = vi.spyOn(LearningManager, "init").mockImplementation(() => {});
    const readySpy = vi.spyOn(LearningManager, "ready").mockResolvedValue(undefined);

    // Import main.ts to trigger its side effects
    await import("../src/main");

    // Check Hooks.once calls
    expect(Hooks.once).toHaveBeenCalledWith("init", expect.any(Function));
    expect(Hooks.once).toHaveBeenCalledWith("ready", expect.any(Function));

    // Find and execute the "init" hook callback
    const initHook = vi.mocked(Hooks.once).mock.calls.find((c) => c[0] === "init");
    if (!initHook) throw new Error("Init hook callback not found");
    initHook[1]();
    expect(initSpy).toHaveBeenCalled();

    // Find and execute the "ready" hook callback
    const readyHook = vi.mocked(Hooks.once).mock.calls.find((c) => c[0] === "ready");
    if (!readyHook) throw new Error("Ready hook callback not found");
    await readyHook[1]();
    expect(readySpy).toHaveBeenCalled();
  });
});
