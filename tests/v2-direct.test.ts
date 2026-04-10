import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrateToV2Direct } from "../src/migrations/v2-direct";
import * as migrationUtils from "../src/migrations/migration-utils";

vi.mock("../src/migrations/migration-utils", () => ({
  createProjectItemFromTemplate: vi.fn().mockResolvedValue({}),
}));

describe("Migration v2 (Direct)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
    (global as any).game = {
      settings: { get: vi.fn(), set: vi.fn().mockResolvedValue(true) },
      user: { isGM: true },
      actors: [],
    };
    (global as any).foundry = { utils: { randomID: vi.fn().mockReturnValue("rand123") } };
  });

  it("should migrate rules, tiers, and projects", async () => {
    const mockRules = { method: "roll" };
    const mockTiers = [{ id: "t1", costs: { h: 1 } }];
    const mockTemplates = [
      { id: "tpl1", name: "Tpl 1", target: 10, rewardUuid: "uuid", rewardType: "item" },
    ];
    const mockActor = {
      name: "Actor",
      getFlag: vi.fn().mockReturnValue([{ name: "Tpl 1", templateId: "tpl1", progress: 5 }]),
      setFlag: vi.fn().mockResolvedValue(true),
    };

    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "rules") return mockRules;
      if (key === "guidanceTiers") return mockTiers;
      if (key === "projectTemplates") return mockTemplates;
      return null;
    });
    game.actors = [mockActor as any];

    await migrateToV2Direct();

    expect(game.settings.set).toHaveBeenCalledWith(
      expect.any(String),
      "rules",
      expect.objectContaining({ critThreshold: 20 }),
    );
    expect(game.settings.set).toHaveBeenCalledWith(
      expect.any(String),
      "guidanceTiers",
      expect.arrayContaining([expect.objectContaining({ costs: { h: 100 }, _migratedToV2: true })]),
    );
    expect(migrationUtils.createProjectItemFromTemplate).toHaveBeenCalled();
    expect(mockActor.setFlag).toHaveBeenCalledWith(expect.any(String), "projects", []);
  });

  it("should handle migration failures for individual projects", async () => {
    vi.mocked(game.settings.get).mockImplementation((scope, key) => {
      if (key === "rules") return {};
      if (key === "guidanceTiers") return [];
      if (key === "projectTemplates") return [];
      return null;
    });
    vi.mocked(migrationUtils.createProjectItemFromTemplate).mockResolvedValue(null); // Fail
    const mockActor = {
      name: "Actor",
      getFlag: vi.fn().mockReturnValue([{ name: "Project", id: "p1" }]),
      setFlag: vi.fn(),
    };
    game.actors = [mockActor as any];

    await migrateToV2Direct();

    expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("partially failed"));
    expect(mockActor.setFlag).toHaveBeenCalledWith(expect.any(String), "projects", [
      expect.objectContaining({ id: "p1" }),
    ]);
  });
});
