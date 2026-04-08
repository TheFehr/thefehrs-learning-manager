import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getModuleAPI } from "../src/types";

describe("getModuleAPI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).game = {
      modules: {
        get: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as any).game;
  });

  it("should return the module API if module exists", () => {
    const mockModule = {
      api: { some: "api", search: vi.fn(), open: vi.fn() },
    };
    vi.mocked(game.modules.get).mockReturnValue(mockModule as any);

    expect(getModuleAPI("quick-insert" as any)).toEqual({
      some: "api",
      search: expect.any(Function),
      open: expect.any(Function),
    });
  });

  it("should return undefined if game is undefined", () => {
    (global as any).game = undefined;
    expect(getModuleAPI("any" as any)).toBeUndefined();
  });

  it("should return undefined if module api shape mismatch for quick-insert", () => {
    const mockModule = {
      api: { some: "api" }, // missing search and open
    };
    vi.mocked(game.modules.get).mockReturnValue(mockModule as any);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(getModuleAPI("quick-insert" as any)).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Module API shape mismatch"));
  });

  it("should return undefined if module exists but has no api", () => {
    vi.mocked(game.modules.get).mockReturnValue({ active: true } as any);
    expect(getModuleAPI("some-module" as any)).toBeUndefined();
  });

  it("should return undefined if module api is not an object", () => {
    vi.mocked(game.modules.get).mockReturnValue({ api: "not-an-object" } as any);
    expect(getModuleAPI("some-module" as any)).toBeUndefined();
  });

  it("should return undefined if module does not exist", () => {
    vi.mocked(game.modules.get).mockReturnValue(undefined);
    expect(getModuleAPI("missing" as any)).toBeUndefined();
  });
});
