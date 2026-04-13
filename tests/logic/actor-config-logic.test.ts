import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActorConfigLogic } from "../../src/logic/actor-config-logic";

describe("ActorConfigLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).ui = { notifications: { error: vi.fn() } };
    (global as any).CONFIG = (global as any).CONFIG || {};
    (global as any).fromUuid = vi.fn().mockResolvedValue({ documentName: "Item" });
  });

  afterEach(() => {
    delete (global as any).ui;
    delete (global as any).CONFIG;
    delete (global as any).fromUuid;
    delete (global as any).game;
  });

  it("should save teacher configuration to flags", async () => {
    const actor = {
      update: vi.fn().mockResolvedValue({}),
    } as any;
    const offerings = [{ name: "Lesson", modifier: 5, costs: {}, categories: ["test"] }];

    await ActorConfigLogic.saveConfig(actor, offerings);

    expect(actor.update).toHaveBeenCalledWith(
      {
        "flags.thefehrs-learning-manager.teacherOfferings": offerings,
      },
      { render: false },
    );
  });

  describe("searchProject", () => {
    it("should use Spotlight Omnisearch if available", async () => {
      (global as any).CONFIG.SpotlightOmnisearch = {
        prompt: vi.fn().mockResolvedValue({ data: { uuid: "item-uuid" } }),
      };

      const result = await ActorConfigLogic.searchProject();
      expect(result).toBe("item-uuid");
      expect((global as any).CONFIG.SpotlightOmnisearch.prompt).toHaveBeenCalledWith({
        query: "!item ",
      });
    });

    it("should return null if no search module is found", async () => {
      delete (global as any).CONFIG.SpotlightOmnisearch;
      (global as any).game = { modules: { get: vi.fn().mockReturnValue(null) } };

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
