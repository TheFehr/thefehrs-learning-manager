import { describe, it, expect, vi, beforeEach } from "vitest";
import { DebugHelpers } from "../src/core/debug";
import { ActorProxy } from "../src/actor-proxy";

vi.mock("../src/actor-proxy", () => ({
  ActorProxy: {
    forActor: vi.fn(),
  },
}));

describe("DebugHelpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).game = {
      user: { character: null },
    };
    (global as any).canvas = {
      tokens: { controlled: [] },
    };
    (global as any).ui = {
      notifications: { info: vi.fn(), warn: vi.fn() },
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("addTime", () => {
    it("should add time to controlled character", async () => {
      const mockActor = { name: "Character" };
      game.user.character = mockActor;
      const mockProxy = { bank: { total: 10 }, setBank: vi.fn() };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      await DebugHelpers.addTime(5);

      expect(mockProxy.setBank).toHaveBeenCalledWith({ total: 15 });
      expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining("Added 5h"));
    });

    it("should fall back to selected token", async () => {
      const mockActor = { name: "Token Actor" };
      (canvas as any).tokens.controlled = [{ actor: mockActor }];
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
      await DebugHelpers.addTime(-5);
      expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("Invalid hours"));
      expect(ActorProxy.forActor).not.toHaveBeenCalled();
    });
  });

  describe("addGP", () => {
    it("should add GP to character", async () => {
      const mockActor = { name: "Character" };
      game.user.character = mockActor;
      const mockProxy = { currency: { gp: 10, sp: 0, cp: 0 }, updateCurrency: vi.fn() };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      await DebugHelpers.addGP(100);

      expect(mockProxy.updateCurrency).toHaveBeenCalledWith({ gp: 110, sp: 0, cp: 0 });
    });

    it("should validate input", async () => {
      await DebugHelpers.addGP(NaN);
      expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("Invalid gp"));
    });
  });
});
