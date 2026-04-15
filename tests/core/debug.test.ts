import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DebugHelpers } from "../../src/core/debug";
import { ActorProxy } from "../../src/logic/actor-proxy";
import { TutelageResolverService } from "../../src/logic/tutelage-resolver";
import { Settings } from "../../src/core/settings";

vi.mock("@/logic/actor-proxy", () => ({
  ActorProxy: {
    forActor: vi.fn(),
  },
}));

vi.mock("@/logic/tutelage-resolver", () => ({
  TutelageResolverService: {
    clearCache: vi.fn(),
    getCache: vi.fn(),
    refreshCache: vi.fn(),
  },
}));

vi.mock("@/core/settings", () => ({
  Settings: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("DebugHelpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TutelageResolverService.clearCache();
    (globalThis as any).Actor = class {
      name = "";
      system = {};
      getFlag = vi.fn();
      getRollData = vi.fn().mockReturnValue({});
    };
    (globalThis as any).game = {
      user: { character: null },
    };
    (globalThis as any).canvas = {
      ready: true,
      tokens: { controlled: [] },
    };
    (globalThis as any).ui = {
      notifications: { info: vi.fn(), warn: vi.fn() },
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).game;
    delete (globalThis as any).canvas;
    delete (globalThis as any).ui;
  });

  describe("addTime", () => {
    it("should add time to controlled character", async () => {
      const mockActor = new (globalThis as any).Actor();
      mockActor.name = "Character";
      globalThis.game.user.character = mockActor;
      const mockProxy = { bank: { total: 10 }, setBank: vi.fn() };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      await DebugHelpers.addTime(5);

      expect(mockProxy.setBank).toHaveBeenCalledWith({ total: 15 });
      expect(globalThis.ui.notifications.info).toHaveBeenCalledWith(
        expect.stringContaining("Added 5h"),
      );
    });

    it("should fall back to selected token", async () => {
      const mockActor = new (globalThis as any).Actor();
      mockActor.name = "Token Actor";
      (globalThis.canvas as any).tokens.controlled = [{ actor: mockActor }];
      const mockProxy = { bank: { total: 0 }, setBank: vi.fn() };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      await DebugHelpers.addTime(10);

      expect(mockProxy.setBank).toHaveBeenCalledWith({ total: 10 });
    });

    it("should warn if no actor found", async () => {
      await DebugHelpers.addTime(10);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("No character controlled"));
    });

    it("should validate input", async () => {
      await DebugHelpers.addTime("abc" as any);
      expect(globalThis.ui.notifications.warn).toHaveBeenCalledWith(
        expect.stringContaining("Invalid hours"),
      );
      expect(ActorProxy.forActor).not.toHaveBeenCalled();
    });

    it("should validate NaN input", async () => {
      await DebugHelpers.addTime(NaN);
      expect(globalThis.ui.notifications.warn).toHaveBeenCalledWith(
        expect.stringContaining("Invalid hours"),
      );
      expect(ActorProxy.forActor).not.toHaveBeenCalled();
    });

    it("should warn if bank is already empty and trying to remove time", async () => {
      const mockActor = new (globalThis as any).Actor();
      mockActor.name = "Character";
      globalThis.game.user.character = mockActor;
      const mockProxy = { bank: { total: 0 }, setBank: vi.fn() };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      await DebugHelpers.addTime(-5);

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Bank already empty"));
      expect(mockProxy.setBank).not.toHaveBeenCalled();
    });
  });

  describe("addGP", () => {
    it("should add GP to character", async () => {
      const mockActor = new (globalThis as any).Actor();
      mockActor.name = "Character";
      globalThis.game.user.character = mockActor;
      const mockProxy = {
        currency: { gp: 10, sp: 0, cp: 0, ep: 0, pp: 0 },
        updateCurrency: vi.fn(),
      };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      await DebugHelpers.addGP(100);

      expect(mockProxy.updateCurrency).toHaveBeenCalledWith({
        gp: 110,
        sp: 0,
        cp: 0,
        ep: 0,
        pp: 0,
      });
    });

    it("should validate input", async () => {
      await DebugHelpers.addGP(NaN);
      expect(globalThis.ui.notifications.warn).toHaveBeenCalledWith(
        expect.stringContaining("Invalid gp"),
      );
    });

    it("should warn if no actor found", async () => {
      globalThis.game.user.character = undefined;
      await DebugHelpers.addGP(100);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("No character controlled"));
    });

    it("should fall back to selected token", async () => {
      globalThis.game.user.character = undefined;
      const mockActor = new (globalThis as any).Actor();
      mockActor.name = "Token Actor";
      (globalThis.canvas as any).tokens.controlled = [{ actor: mockActor }];
      const mockProxy = {
        currency: { gp: 50, sp: 0, cp: 0, ep: 0, pp: 0 },
        updateCurrency: vi.fn(),
      };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      await DebugHelpers.addGP(50);

      expect(mockProxy.updateCurrency).toHaveBeenCalledWith({
        gp: 100,
        sp: 0,
        cp: 0,
        ep: 0,
        pp: 0,
      });
    });

    it("should warn if no GP available to remove", async () => {
      const mockActor = new (globalThis as any).Actor();
      mockActor.name = "Character";
      globalThis.game.user.character = mockActor;
      const mockProxy = {
        currency: { gp: 0, sp: 0, cp: 0, ep: 0, pp: 0 },
        updateCurrency: vi.fn(),
      };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      await DebugHelpers.addGP(-10);

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("No GP available"));
      expect(mockProxy.updateCurrency).not.toHaveBeenCalled();
    });
  });

  describe("Cache and Config helpers", () => {
    it("should clear cache", () => {
      DebugHelpers.clearCache();
      expect(TutelageResolverService.clearCache).toHaveBeenCalled();
    });

    it("should get cache", () => {
      vi.mocked(TutelageResolverService.getCache).mockReturnValue([
        {
          actorUuid: "uuid",
          name: "Actor",
          offering: { name: "Offering", modifier: 1, categories: ["magic"], costs: {} },
        },
      ] as any);
      const cache = DebugHelpers.getCache();
      expect(cache).not.toBeNull();
      expect(cache.length).toBe(1);
    });

    it("should refresh cache", async () => {
      vi.mocked(TutelageResolverService.refreshCache).mockResolvedValue();
      vi.spyOn(DebugHelpers, "getCache").mockReturnValue([{ actorUuid: "uuid" } as any]);
      await DebugHelpers.refreshCache();
      expect(TutelageResolverService.refreshCache).toHaveBeenCalled();
    });

    it("should get config", () => {
      vi.mocked(Settings.get).mockReturnValue([]);
      const config = DebugHelpers.getConfig();
      expect(config).toHaveProperty("teacherCompendiums");
      expect(config).toHaveProperty("bookCompendiums");
    });
  });

  describe("Migration helpers", () => {
    it("should reset migration", async () => {
      vi.mocked(Settings.set).mockResolvedValue(undefined as any);
      vi.spyOn(DebugHelpers, "runMigration").mockResolvedValue();
      await DebugHelpers.resetMigration("1.0.0");
      expect(Settings.set).toHaveBeenCalledWith("migrationVersion", "1.0.0");
      expect(DebugHelpers.runMigration).toHaveBeenCalled();
    });
  });
});
