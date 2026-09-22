import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PartyTabLogic } from "../../src/logic/party-tab-logic";
import { Settings } from "../../src/core/settings";
import { TabLogic } from "../../src/logic/tab-logic";
import { ActorProxy } from "../../src/logic/actor-proxy";
import { ProjectEngine } from "../../src/logic/project-engine";
import { FoundryUtils } from "../../src/core/foundry-utils";
import { PartyTabPending } from "../../src/logic/party-tab-pending";
import { PartyTabCompletionLock } from "../../src/logic/party-tab-completion-lock";

vi.mock("@/core/settings");
vi.mock("@/logic/tab-logic");
vi.mock("@/logic/actor-proxy");
vi.mock("@/logic/project-engine");
vi.mock("@/core/foundry-utils");

describe("PartyTabLogic", () => {
  let originalActors: any;
  let originalFoundry: any;

  beforeEach(() => {
    vi.resetAllMocks();
    PartyTabPending.clear();
    PartyTabCompletionLock.clear();
    originalFoundry = (globalThis as any).foundry;

    // Mock Settings.get
    vi.spyOn(Settings, "get").mockImplementation((key) => {
      if (key === "timeUnits") return [];
      if (key === "guidanceTiers") return [];
      return null;
    });

    // Mock FoundryUtils.deepClone
    vi.mocked(FoundryUtils.deepClone).mockImplementation((obj) => JSON.parse(JSON.stringify(obj)));

    // Mock ChatMessage.implementation
    (globalThis as any).ChatMessage = {
      implementation: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    // Ensure game and ui are initialized
    (globalThis as any).ui = {
      notifications: {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
      },
    };

    (globalThis as any).game = {
      ID: "thefehrs-learning-manager",
      actors: new Map() as any,
    };
    originalActors = (globalThis as any).game.actors;

    (globalThis as any).fromUuid = vi.fn().mockResolvedValue(null);
  });

  afterEach(() => {
    if (globalThis.game) globalThis.game.actors = originalActors;
    (globalThis as any).foundry = originalFoundry;
    vi.restoreAllMocks();
    delete (globalThis as any).ui;
    delete (globalThis as any).ChatMessage;
    delete (globalThis as any).fromUuid;
  });

  describe("openActorSheet", () => {
    it("should open actor sheet by uuid", async () => {
      const mockSheet = { render: vi.fn() };
      const mockDoc = { sheet: mockSheet };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockDoc);

      await PartyTabLogic.openActorSheet("Actor.123");

      expect(globalThis.fromUuid).toHaveBeenCalledWith("Actor.123");
      expect(mockSheet.render).toHaveBeenCalledWith(true);
    });

    it("should do nothing if actor not found", async () => {
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(null);
      await PartyTabLogic.openActorSheet("Actor.123");
      expect(globalThis.fromUuid).toHaveBeenCalledWith("Actor.123");
    });
  });

  describe("processGrantTime", () => {
    it("should call signalTimeDistribution and return true after granting time", async () => {
      const timeValues = { hour: 1 };
      const selectedIds = ["actor1"];

      vi.mocked(TabLogic.calculateTotalBaseTime).mockReturnValue(1);
      vi.mocked(TabLogic.formatTimeBank).mockReturnValue("1h");

      const mockActor = {
        id: "actor1",
        type: "character",
        system: { abilities: {}, attributes: {} },
        getFlag: vi.fn(),
        getRollData: vi.fn(),
      };
      (game.actors as any).set(mockActor.id, mockActor);

      const mockProxy = {
        bank: { total: 0 },
        setBank: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      const result = await PartyTabLogic.processGrantTime(timeValues, selectedIds);

      expect(result).toBe(true);
      expect(ProjectEngine.signalTimeDistribution).toHaveBeenCalled();
      expect(ChatMessage.implementation.create).toHaveBeenCalled();
    });

    it("should handle errors when updating bank and return false if none succeeded", async () => {
      const timeValues = { hour: 1 };
      const selectedIds = ["actor1"];

      vi.mocked(TabLogic.calculateTotalBaseTime).mockReturnValue(1);
      const mockActor = {
        id: "actor1",
        type: "character",
        system: { abilities: {}, attributes: {} },
        getFlag: vi.fn(),
        getRollData: vi.fn(),
      };
      (game.actors as any).set(mockActor.id, mockActor);

      const mockProxy = {
        bank: { total: 0 },
        setBank: vi.fn().mockRejectedValue(new Error("Update failed")),
      };
      vi.mocked(ActorProxy.forActor).mockReturnValue(mockProxy as any);

      const result = await PartyTabLogic.processGrantTime(timeValues, selectedIds);

      expect(result).toBe(false);
      expect(ProjectEngine.signalTimeDistribution).not.toHaveBeenCalled();
      expect(ChatMessage.implementation.create).not.toHaveBeenCalled();
    });

    it("should return false if no time is entered", async () => {
      vi.mocked(TabLogic.calculateTotalBaseTime).mockReturnValue(0);

      const result = await PartyTabLogic.processGrantTime({}, ["actor1"]);

      expect(result).toBe(false);
      expect(ProjectEngine.signalTimeDistribution).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalledWith("No time entered.");
    });

    it("should return false if no recipients selected", async () => {
      vi.mocked(TabLogic.calculateTotalBaseTime).mockReturnValue(1);

      const result = await PartyTabLogic.processGrantTime({ hour: 1 }, []);

      expect(result).toBe(false);
      expect(ProjectEngine.signalTimeDistribution).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalledWith("No recipients selected.");
    });
  });

  describe("updateProgress", () => {
    it("should update progress and handle completion", async () => {
      const mockProjectData = { progress: 5, target: 10, isCompleted: false };
      const mockItem = {
        getFlag: vi.fn().mockReturnValue(mockProjectData),
        name: "Test",
      };
      const mockActor = { items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      await PartyTabLogic.updateProgress("Actor.actor1", { id: "item1" } as any, 10, true);

      expect(ProjectEngine.completeProject).toHaveBeenCalledWith(mockItem);
    });

    // Reaching target via a manual progress edit isn't the only way to
    // trigger completion - completeProject (the dedicated button) and
    // updateTarget's own completion branch can too. All three coordinate
    // through the same PartyTabCompletionLock so two of them can't both
    // pass ProjectLifecycle.completeProject's own early isLearningProject
    // check for the same project.
    it("does not complete the project if something else already holds the completion lock", async () => {
      const mockProjectData = { progress: 5, target: 10, isCompleted: false };
      const mockItem = {
        id: "item1",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
        name: "Test",
      };
      const mockActor = {
        uuid: "Actor.actor1",
        items: { get: vi.fn().mockReturnValue(mockItem) },
      };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      expect(PartyTabCompletionLock.tryAcquire("Actor.actor1", "item1")).toBe(true);

      await PartyTabLogic.updateProgress("Actor.actor1", { id: "item1" } as any, 10, true);

      expect(ProjectEngine.completeProject).not.toHaveBeenCalled();
      // Falls back to a silent (non-completing) update instead of just
      // dropping the progress edit on the floor.
      expect(ProjectEngine.updateItemWithProgress).toHaveBeenCalledWith(
        mockItem,
        expect.objectContaining({ progress: 10 }),
        "GM Manual Edit",
        false,
      );
    });

    it("should handle errors gracefully during updateProgress", async () => {
      const mockProjectData = { progress: 5, target: 10, isCompleted: false };
      const mockItem = {
        getFlag: vi.fn().mockReturnValue(mockProjectData),
        name: "Test",
      };
      const mockActor = { items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      vi.mocked(ProjectEngine.updateItemWithProgress).mockRejectedValue(new Error("Update failed"));

      await expect(
        PartyTabLogic.updateProgress("Actor.actor1", { id: "item1" } as any, 8, true),
      ).resolves.not.toThrow();

      expect(ui.notifications.error).toHaveBeenCalled();
    });

    // The pending value is recorded before the write it's standing in for,
    // on the assumption that write will land - if it never does, resolve()
    // would otherwise overlay that unpersisted value on every future read
    // forever, since it only ever clears an entry once a fresh read
    // confirms it (which can't happen for a write that failed).
    it("clears the pending progress edit if the write fails", async () => {
      const mockProjectData = { progress: 5, target: 10, isCompleted: false };
      const mockItem = {
        id: "item1",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
        name: "Test",
      };
      const mockActor = {
        uuid: "Actor.actor1",
        items: { get: vi.fn().mockReturnValue(mockItem) },
      };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);
      vi.mocked(ProjectEngine.updateItemWithProgress).mockRejectedValue(new Error("Update failed"));

      await PartyTabLogic.updateProgress("Actor.actor1", { id: "item1" } as any, 8, true);

      expect(
        PartyTabPending.resolve("Actor.actor1", "item1", {
          progress: 5,
          target: 10,
          name: "Test (5/10)",
        }),
      ).toEqual({ progress: 5, target: 10, name: "Test (5/10)" });
    });

    // Regression coverage for thefehrs-learning-manager#131's e2e failure:
    // this write is deliberately silent (no forced re-render), but
    // LearningManager.renderSvelte remounts the Party tab's Svelte component
    // fresh on every render of its parent sheet rather than doing a
    // props-only update - a remount landing before this write's flag change
    // lands would otherwise read stale data with nothing left to correct it.
    // See PartyTabPending's own comment for the full mechanism.
    it("records the new progress in PartyTabPending so a remount mid-write doesn't read stale data", async () => {
      const mockProjectData = { progress: 5, target: 10, isCompleted: false };
      const mockItem = {
        id: "item1",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
        name: "Test",
      };
      const mockActor = {
        uuid: "Actor.actor1",
        items: { get: vi.fn().mockReturnValue(mockItem) },
      };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      await PartyTabLogic.updateProgress("Actor.actor1", { id: "item1" } as any, 8, true);

      // Simulate a fresh read (e.g. from a remounted component) that still
      // sees the pre-write flag data - the pending edit should win.
      expect(
        PartyTabPending.resolve("Actor.actor1", "item1", {
          progress: 5,
          target: 10,
          name: "Test (5/10)",
        }),
      ).toEqual({ progress: 8, target: 10, name: "Test (8/10)" });
    });
  });

  describe("updateTarget", () => {
    it("should update target and inject activities", async () => {
      const mockProjectData = { progress: 5, target: 10 };
      const mockItem = { getFlag: vi.fn().mockReturnValue(mockProjectData), name: "Test" };
      const mockActor = { items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      await PartyTabLogic.updateTarget("Actor.actor1", { id: "item1" } as any, 20, true);

      expect(ProjectEngine.injectActivities).toHaveBeenCalledWith(mockItem, 20);
      expect(ProjectEngine.updateItemWithProgress).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        false,
      );
    });

    // See the matching updateProgress test above for why this matters.
    it("records the new target in PartyTabPending so a remount mid-write doesn't read stale data", async () => {
      const mockProjectData = { progress: 5, target: 10 };
      const mockItem = {
        id: "item1",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
        name: "Test",
      };
      const mockActor = {
        uuid: "Actor.actor1",
        items: { get: vi.fn().mockReturnValue(mockItem) },
      };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      await PartyTabLogic.updateTarget("Actor.actor1", { id: "item1" } as any, 20, true);

      expect(
        PartyTabPending.resolve("Actor.actor1", "item1", {
          progress: 5,
          target: 10,
          name: "Test (5/10)",
        }),
      ).toEqual({ progress: 5, target: 20, name: "Test (5/20)" });
    });

    it("should handle errors gracefully during updateTarget", async () => {
      const mockProjectData = { progress: 5, target: 10 };
      const mockItem = { getFlag: vi.fn().mockReturnValue(mockProjectData), name: "Test" };
      const mockActor = { items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      vi.mocked(ProjectEngine.updateItemWithProgress).mockRejectedValue(new Error("Update failed"));

      await expect(
        PartyTabLogic.updateTarget("Actor.actor1", { id: "item1" } as any, 20, true),
      ).resolves.not.toThrow();

      expect(ui.notifications.error).toHaveBeenCalled();
    });

    // See updateProgress's matching test above for why this matters.
    it("clears the pending target edit if the write fails", async () => {
      const mockProjectData = { progress: 5, target: 10 };
      const mockItem = {
        id: "item1",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
        name: "Test",
      };
      const mockActor = {
        uuid: "Actor.actor1",
        items: { get: vi.fn().mockReturnValue(mockItem) },
      };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);
      vi.mocked(ProjectEngine.updateItemWithProgress).mockRejectedValue(new Error("Update failed"));

      await PartyTabLogic.updateTarget("Actor.actor1", { id: "item1" } as any, 20, true);

      expect(
        PartyTabPending.resolve("Actor.actor1", "item1", {
          progress: 5,
          target: 10,
          name: "Test (5/10)",
        }),
      ).toEqual({ progress: 5, target: 10, name: "Test (5/10)" });
    });

    it("should complete project if target is lowered below current progress", async () => {
      const mockProjectData = { progress: 15, target: 20 };
      const mockItem = { getFlag: vi.fn().mockReturnValue(mockProjectData), name: "Test" };
      const mockActor = { items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      await PartyTabLogic.updateTarget("Actor.actor1", { id: "item1" } as any, 10, true);

      expect(ProjectEngine.completeProject).toHaveBeenCalledWith(mockItem);
    });

    // See updateProgress's matching test for why this coordination matters.
    it("does not complete the project if something else already holds the completion lock", async () => {
      const mockProjectData = { progress: 15, target: 20 };
      const mockItem = {
        id: "item1",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
        name: "Test",
      };
      const mockActor = {
        uuid: "Actor.actor1",
        items: { get: vi.fn().mockReturnValue(mockItem) },
      };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      expect(PartyTabCompletionLock.tryAcquire("Actor.actor1", "item1")).toBe(true);

      await PartyTabLogic.updateTarget("Actor.actor1", { id: "item1" } as any, 10, true);

      expect(ProjectEngine.completeProject).not.toHaveBeenCalled();
      expect(ProjectEngine.updateItemWithProgress).toHaveBeenCalledWith(
        mockItem,
        expect.objectContaining({ target: 10 }),
        "GM Manual Edit",
        false,
      );
    });

    it("should do nothing if NOT GM", async () => {
      await PartyTabLogic.updateTarget("Actor.actor1", { id: "item1" } as any, 20, false);
      expect(ProjectEngine.updateItemWithProgress).not.toHaveBeenCalled();
    });
  });

  describe("completeProject", () => {
    it("should complete the project directly when confirmed, regardless of current progress", async () => {
      const mockProjectData = { progress: 3, target: 10, isCompleted: false };
      const mockItem = {
        id: "item1",
        name: "Test",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
      };
      const mockActor = { name: "Actor", items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      const confirmFn = vi.fn().mockResolvedValue(true);
      await PartyTabLogic.completeProject(
        "Actor.actor1",
        { id: "item1", name: "Test", progress: 3 } as any,
        confirmFn,
        true,
      );

      expect(confirmFn).toHaveBeenCalled();
      expect(ProjectEngine.updateItemWithProgress).toHaveBeenCalledWith(
        mockItem,
        expect.objectContaining({ progress: 10, target: 10 }),
        "GM Manual Edit",
        true,
      );
      expect(ProjectEngine.completeProject).toHaveBeenCalledWith(mockItem);
    });

    it("should not complete the project if cancelled", async () => {
      const mockProjectData = { progress: 3, target: 10, isCompleted: false };
      const mockItem = {
        id: "item1",
        name: "Test",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
      };
      const mockActor = { name: "Actor", items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      const confirmFn = vi.fn().mockResolvedValue(false);
      await PartyTabLogic.completeProject(
        "Actor.actor1",
        { id: "item1", name: "Test", progress: 3 } as any,
        confirmFn,
        true,
      );

      expect(ProjectEngine.updateItemWithProgress).not.toHaveBeenCalled();
      expect(ProjectEngine.completeProject).not.toHaveBeenCalled();
    });

    it("should do nothing if NOT GM", async () => {
      const confirmFn = vi.fn();
      await PartyTabLogic.completeProject(
        "Actor.actor1",
        { id: "item1", name: "Test" } as any,
        confirmFn,
        false,
      );
      expect(confirmFn).not.toHaveBeenCalled();
      expect(ProjectEngine.completeProject).not.toHaveBeenCalled();
    });

    it("should warn and do nothing if the project has no valid target", async () => {
      const mockProjectData = { progress: 3, target: 0, isCompleted: false };
      const mockItem = {
        id: "item1",
        name: "Test",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
      };
      const mockActor = { name: "Actor", items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      const confirmFn = vi.fn();
      await PartyTabLogic.completeProject(
        "Actor.actor1",
        { id: "item1", name: "Test" } as any,
        confirmFn,
        true,
      );

      expect(confirmFn).not.toHaveBeenCalled();
      expect(ProjectEngine.completeProject).not.toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("valid target"));
    });

    it("should handle errors gracefully", async () => {
      const mockProjectData = { progress: 3, target: 10, isCompleted: false };
      const mockItem = {
        id: "item1",
        name: "Test",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
      };
      const mockActor = { name: "Actor", items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      vi.mocked(ProjectEngine.updateItemWithProgress).mockRejectedValue(new Error("Update failed"));
      const confirmFn = vi.fn().mockResolvedValue(true);

      await expect(
        PartyTabLogic.completeProject(
          "Actor.actor1",
          { id: "item1", name: "Test" } as any,
          confirmFn,
          true,
        ),
      ).resolves.not.toThrow();
    });

    // The lock is acquired synchronously (before any await), so this holds
    // regardless of whether the second call comes from a rapid second
    // click on the same component instance or - since the lock lives at
    // module scope, not component $state - from a fresh instance mounted
    // after a mid-flight remount. See PartyTabCompletionLock's own comment.
    it("blocks a second completeProject call for the same project while the first is in flight", async () => {
      const mockProjectData = { progress: 3, target: 10, isCompleted: false };
      const mockItem = {
        id: "item1",
        name: "Test",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
      };
      const mockActor = { name: "Actor", items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      const confirmFn = vi.fn().mockResolvedValue(true);
      const project = { id: "item1", name: "Test", progress: 3 } as any;

      const first = PartyTabLogic.completeProject("Actor.actor1", project, confirmFn, true);
      const second = PartyTabLogic.completeProject("Actor.actor1", project, confirmFn, true);
      await Promise.all([first, second]);

      expect(confirmFn).toHaveBeenCalledTimes(1);
      expect(ProjectEngine.completeProject).toHaveBeenCalledTimes(1);
    });

    it("releases the lock once completion finishes, allowing a later call through", async () => {
      const mockProjectData = { progress: 3, target: 10, isCompleted: false };
      const mockItem = {
        id: "item1",
        name: "Test",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
      };
      const mockActor = { name: "Actor", items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      const confirmFn = vi.fn().mockResolvedValue(true);
      const project = { id: "item1", name: "Test", progress: 3 } as any;

      await PartyTabLogic.completeProject("Actor.actor1", project, confirmFn, true);
      await PartyTabLogic.completeProject("Actor.actor1", project, confirmFn, true);

      expect(confirmFn).toHaveBeenCalledTimes(2);
    });

    it("releases the lock if the confirmation is cancelled, allowing a retry", async () => {
      const mockProjectData = { progress: 3, target: 10, isCompleted: false };
      const mockItem = {
        id: "item1",
        name: "Test",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
      };
      const mockActor = { name: "Actor", items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      const confirmFn = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const project = { id: "item1", name: "Test", progress: 3 } as any;

      await PartyTabLogic.completeProject("Actor.actor1", project, confirmFn, true);
      await PartyTabLogic.completeProject("Actor.actor1", project, confirmFn, true);

      expect(ProjectEngine.completeProject).toHaveBeenCalledTimes(1);
    });

    it("releases the lock if the write fails, allowing a retry", async () => {
      const mockProjectData = { progress: 3, target: 10, isCompleted: false };
      const mockItem = {
        id: "item1",
        name: "Test",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
      };
      const mockActor = { name: "Actor", items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      vi.mocked(ProjectEngine.updateItemWithProgress)
        .mockRejectedValueOnce(new Error("Update failed"))
        .mockResolvedValueOnce(undefined);
      const confirmFn = vi.fn().mockResolvedValue(true);
      const project = { id: "item1", name: "Test", progress: 3 } as any;

      await PartyTabLogic.completeProject("Actor.actor1", project, confirmFn, true);
      await PartyTabLogic.completeProject("Actor.actor1", project, confirmFn, true);

      expect(ProjectEngine.completeProject).toHaveBeenCalledTimes(1);
    });

    // showCompleteConfirm's dialog.render() is async - if its render
    // pipeline rejects, nothing else would ever settle that promise (no
    // button click, no close event), which without a rejection handler
    // would leave this call - and the completion lock it holds - hanging
    // forever.
    it("resolves and releases the lock if the confirmation dialog fails to render", async () => {
      const mockProjectData = { progress: 3, target: 10, isCompleted: false };
      const mockItem = {
        id: "item1",
        name: "Test",
        getFlag: vi.fn().mockReturnValue(mockProjectData),
      };
      const mockActor = { name: "Actor", items: { get: vi.fn().mockReturnValue(mockItem) } };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      vi.spyOn(foundry.applications.api.DialogV2.prototype, "render").mockRejectedValue(
        new Error("render failed"),
      );

      const project = { id: "item1", name: "Test", progress: 3 } as any;

      await expect(
        PartyTabLogic.completeProject("Actor.actor1", project, undefined, true),
      ).resolves.not.toThrow();
      expect(ProjectEngine.completeProject).not.toHaveBeenCalled();

      // A legitimate retry must not be blocked by a lock the failed render
      // never released.
      const confirmFn = vi.fn().mockResolvedValue(true);
      await PartyTabLogic.completeProject("Actor.actor1", project, confirmFn, true);
      expect(confirmFn).toHaveBeenCalled();
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
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      const confirmFn = vi.fn().mockResolvedValue(true);
      await PartyTabLogic.deleteProject(
        "Actor.actor1",
        { id: "item1", progress: 0 } as any,
        confirmFn,
        false,
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
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      const confirmFn = vi.fn().mockResolvedValue(false);
      await PartyTabLogic.deleteProject(
        "Actor.actor1",
        { id: "item1", progress: 0 } as any,
        confirmFn,
        false,
      );

      expect(mockItem.delete).not.toHaveBeenCalled();
    });

    it("should warn if no permission", async () => {
      const mockActor = { isOwner: false };
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(mockActor);

      await PartyTabLogic.deleteProject("Actor.actor1", {} as any, undefined, false);
      expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("permission"));
    });

    it("should warn if trying to abort in-progress project without being GM", async () => {
      const mockActor = { isOwner: true, name: "Actor" };
      vi.mocked(globalThis.fromUuid).mockResolvedValue(mockActor as any);

      await PartyTabLogic.deleteProject("Actor.actor1", { progress: 5 } as any, undefined, false);
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        expect.stringContaining("cannot abort an in-progress project"),
      );
    });
  });
});
