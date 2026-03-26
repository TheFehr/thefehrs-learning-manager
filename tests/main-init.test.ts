import { describe, it, expect, vi, beforeEach } from "vitest";
import { LearningManager } from "../src/LearningManager";

// Mock migrateData to avoid running actual migrations
vi.mock("../src/migrations/migration.js", () => ({
  migrateData: vi.fn().mockResolvedValue(undefined),
}));

describe("main.ts side effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should register init and ready hooks", async () => {
    // Spy on LearningManager methods
    const initSpy = vi.spyOn(LearningManager, "init").mockImplementation(() => {});
    const readySpy = vi.spyOn(LearningManager, "ready").mockImplementation(() => {});

    // Import main.ts to trigger its side effects
    await import("../src/main");

    // Check Hooks.once calls
    expect(Hooks.once).toHaveBeenCalledWith("init", expect.any(Function));
    expect(Hooks.once).toHaveBeenCalledWith("ready", expect.any(Function));

    // Find and execute the "init" hook callback
    const initHook = vi.mocked(Hooks.once).mock.calls.find((c) => c[0] === "init");
    initHook![1]();
    expect(initSpy).toHaveBeenCalled();

    // Find and execute the "ready" hook callback
    const readyHook = vi.mocked(Hooks.once).mock.calls.find((c) => c[0] === "ready");
    await readyHook![1]();
    expect(readySpy).toHaveBeenCalled();
  });
});
