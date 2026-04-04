import { describe, it, expect, vi, beforeEach } from "vitest";
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

  it("should return the module API if module exists", () => {
    const mockModule = { api: { some: "api" } };
    vi.mocked(game.modules.get).mockReturnValue(mockModule as any);

    expect(getModuleAPI("quick-insert" as any)).toEqual({ some: "api" });
  });

  it("should return undefined if module does not exist", () => {
    vi.mocked(game.modules.get).mockReturnValue(undefined);
    expect(getModuleAPI("missing" as any)).toBeUndefined();
  });
});
