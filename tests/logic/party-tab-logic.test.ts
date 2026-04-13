import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PartyTabLogic } from "../../src/logic/party-tab-logic";
import { Settings } from "../../src/core/settings";
import { TabLogic } from "../../src/logic/tab-logic";
import { ActorProxy } from "../../src/logic/actor-proxy";
import { ProjectEngine } from "../../src/logic/project-engine";

vi.mock("../../src/core/settings");
vi.mock("../../src/logic/tab-logic");
vi.mock("../../src/logic/actor-proxy");
vi.mock("../../src/logic/project-engine");

describe("PartyTabLogic", () => {
  let originalActors: any;
  let originalFoundry: any;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFoundry = (global as any).foundry;

    // Mock Settings.get
    vi.spyOn(Settings, "get").mockImplementation((key) => {
      if (key === "timeUnits") return [];
      if (key === "guidanceTiers") return [];
      return null;
    });

    // Mock ChatMessage.implementation
    (global as any).ChatMessage = {
      implementation: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    // Spy on ui.notifications
    if (!(global as any).ui) (global as any).ui = {};
    if (!(global as any).ui.notifications)
      (global as any).ui.notifications = { warn: vi.fn(), info: vi.fn() };
    vi.spyOn(global.ui.notifications, "warn").mockImplementation(() => {});
    vi.spyOn(global.ui.notifications, "info").mockImplementation(() => {});

    // Replace game.actors with a Map-like structure
    if (!global.game) global.game = { ID: "thefehrs-learning-manager" } as any;
    originalActors = global.game.actors;
    const mockMap = new Map();
    vi.spyOn(mockMap, "get");
    global.game.actors = mockMap as any;
  });

  afterEach(() => {
    if (global.game) global.game.actors = originalActors;
    (global as any).foundry = originalFoundry;
    vi.restoreAllMocks();
    delete (global as any).ui;
    delete (global as any).ChatMessage;
  });

  describe("processGrantTime", () => {
    it("should call signalTimeDistribution after granting time", async () => {
      const timeValues = { hour: 1 };
      const selectedIds = ["actor1"];

      vi.mocked(TabLogic.calculateTotalBaseTime).mockReturnValue(1);
      vi.mocked(TabLogic.formatTimeBank).mockReturnValue("1h");

      const mockActor = { id: "actor1" };
      (game.actors as any).set(mockActor.id, mockActor);

      const mockProxy = {
        bank: { total: 0 },
        setBank: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      await PartyTabLogic.processGrantTime(timeValues, selectedIds);

      expect(ProjectEngine.signalTimeDistribution).toHaveBeenCalled();
    });

    it("should not call signalTimeDistribution if no time is entered", async () => {
      vi.mocked(TabLogic.calculateTotalBaseTime).mockReturnValue(0);

      await PartyTabLogic.processGrantTime({}, ["actor1"]);

      expect(ProjectEngine.signalTimeDistribution).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalledWith("No time entered.");
    });

    it("should not call signalTimeDistribution if no recipients selected", async () => {
      vi.mocked(TabLogic.calculateTotalBaseTime).mockReturnValue(1);

      await PartyTabLogic.processGrantTime({ hour: 1 }, []);

      expect(ProjectEngine.signalTimeDistribution).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalledWith("No recipients selected.");
    });
  });

  describe("updateProgress", () => {
    it("should update progress and handle completion", async () => {
      const mockProjectData = { progress: 5, target: 10, isCompleted: false };
      const mockItem = {
        getFlag: vi.fn().mockReturnValue(mockProjectData),
      };
      const mockActor = { items: { get: vi.fn().mockReturnValue(mockItem) } };
      (game.actors as any).set("actor1", mockActor);

      await PartyTabLogic.updateProgress("actor1", { id: "item1" } as any, 10, true);

      expect(ProjectEngine.completeProject).toHaveBeenCalledWith(mockItem);
    });

    it("should update item without completion if target not reached", async () => {
      const mockProjectData = { progress: 5, target: 10, isCompleted: false };
      const mockItem = { getFlag: vi.fn().mockReturnValue(mockProjectData) };
      const mockActor = { items: { get: vi.fn().mockReturnValue(mockItem) } };
      (game.actors as any).set("actor1", mockActor);

      await PartyTabLogic.updateProgress("actor1", { id: "item1" } as any, 8, true);

      expect(ProjectEngine.updateItemWithProgress).toHaveBeenCalledWith(
        mockItem,
        expect.objectContaining({ progress: 8 }),
      );
    });
  });

  describe("updateTarget", () => {
    it("should update target and inject activities", async () => {
      const mockProjectData = { progress: 5, target: 10 };
      const mockItem = { getFlag: vi.fn().mockReturnValue(mockProjectData), name: "Test" };
      const mockActor = { items: { get: vi.fn().mockReturnValue(mockItem) } };
      (game.actors as any).set("actor1", mockActor);

      await PartyTabLogic.updateTarget("actor1", { id: "item1" } as any, 20, true);

      expect(ProjectEngine.injectActivities).toHaveBeenCalledWith(mockItem, 20);
      expect(ProjectEngine.updateItemWithProgress).toHaveBeenCalled();
    });
  });

  describe("deleteProject", () => {
    it("should delete item if confirmed", async () => {
      const mockItem = { delete: vi.fn() };
      const mockActor = {
        name: "Actor",
        isOwner: true,
        items: { get: vi.fn().mockReturnValue(mockItem) },
      };
      (game.actors as any).set("actor1", mockActor);

      const confirmFn = vi.fn().mockResolvedValue(true);
      await PartyTabLogic.deleteProject(
        "actor1",
        { id: "item1", progress: 0 } as any,
        false,
        confirmFn,
      );

      expect(mockItem.delete).toHaveBeenCalled();
    });

    it("should not delete item if cancelled", async () => {
      const mockItem = { delete: vi.fn() };
      const mockActor = {
        name: "Actor",
        isOwner: true,
        items: { get: vi.fn().mockReturnValue(mockItem) },
      };
      (game.actors as any).set("actor1", mockActor);

      const confirmFn = vi.fn().mockResolvedValue(false);
      await PartyTabLogic.deleteProject(
        "actor1",
        { id: "item1", progress: 0 } as any,
        false,
        confirmFn,
      );

      expect(mockItem.delete).not.toHaveBeenCalled();
    });

    it("should warn if no permission", async () => {
      const mockActor = { isOwner: false };
      (game.actors as any).set("actor1", mockActor);

      await PartyTabLogic.deleteProject("actor1", {} as any, false);
      expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("permission"));
    });
  });
});
