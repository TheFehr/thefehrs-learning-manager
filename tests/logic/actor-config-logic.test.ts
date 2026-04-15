import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActorConfigLogic } from "../../src/logic/actor-config-logic";

describe("ActorConfigLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).ui = { notifications: { error: vi.fn() } };
    (globalThis as any).CONFIG = (globalThis as any).CONFIG || {};
    (globalThis as any).fromUuid = vi.fn().mockResolvedValue({ documentName: "Item" });
  });

  afterEach(() => {
    delete (globalThis as any).ui;
    delete (globalThis as any).CONFIG;
    delete (globalThis as any).fromUuid;
    delete (globalThis as any).game;
  });

  it("should save teacher configuration to flags", async () => {
    const actor = {
      update: vi.fn().mockResolvedValue({}),
    } as any;
    const offerings = [{ name: "Lesson", modifier: 5, costs: {}, categories: ["test"] }];

    await ActorConfigLogic.saveConfig(actor, offerings, true);

    expect(actor.update).toHaveBeenCalledWith(
      {
        "flags.thefehrs-learning-manager.teacherOfferings": offerings,
        "flags.thefehrs-learning-manager.learningModeEnabled": true,
      },
      { render: false },
    );
  });

  describe("searchProject", () => {
    it("should use Spotlight Omnisearch if available", async () => {
      (globalThis as any).CONFIG.SpotlightOmnisearch = {
        prompt: vi.fn().mockResolvedValue({ data: { uuid: "item-uuid" } }),
      };

      const result = await ActorConfigLogic.searchProject();
      expect(result).toBe("item-uuid");
      expect((globalThis as any).CONFIG.SpotlightOmnisearch.prompt).toHaveBeenCalledWith({
        query: "!item ",
      });
    });

    it("should return null if no search module is found", async () => {
      delete (globalThis as any).CONFIG.SpotlightOmnisearch;
      (globalThis as any).game = { modules: { get: vi.fn().mockReturnValue(null) } };

      const result = await ActorConfigLogic.searchProject();
      expect(result).toBeNull();
    });
  });

  describe("handleDrop", () => {
    it("should extract item uuid from valid drop data", () => {
      const data = { type: "Item", uuid: "item-123" };
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          getData: vi.fn().mockReturnValue(JSON.stringify(data)),
        },
      } as any;

      const result = ActorConfigLogic.handleDrop(event);
      expect(result).toBe("item-123");
    });

    it("should return null for invalid drop data", () => {
      const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          getData: vi.fn().mockReturnValue("invalid-json"),
        },
      } as any;

      const result = ActorConfigLogic.handleDrop(event);
      expect(result).toBeNull();
    });
  });
});
