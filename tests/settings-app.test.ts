import { describe, it, expect, vi, beforeEach } from "vitest";
import { LearningConfigApp } from "../src/settings-app";
import { ActorsCollection } from "./setup";

describe("LearningConfigApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("_prepareContext", () => {
    it("should return settings data", async () => {
      vi.mocked(game.settings.get).mockImplementation((scope, key) => {
        if (key === "rules") return { method: "roll" };
        if (key === "timeUnits") return [{ id: "hr", ratio: 1 }];
        if (key === "guidanceTiers") return [];
        if (key === "projectTemplates") return [];
        return null;
      });

      const app = new LearningConfigApp();
      // @ts-ignore
      const context = await app._prepareContext();

      expect(context.rules.method).toBe("roll");
      expect(context.choices).toEqual({
        direct: "1 Base Unit = 1 Progress",
        roll: "Learning Check",
      });
      expect(context.timeUnits).toHaveLength(1);
      expect(game.settings.get).toHaveBeenCalledTimes(4);
    });
  });

  describe("saveFormData", () => {
    it("should expand form data and update settings", async () => {
      const app = new LearningConfigApp();
      const mockForm = document.createElement("form");
      // @ts-ignore
      app.element = mockForm;

      const mockData = {
        rules: { method: "direct" },
        timeUnits: { "0": { id: "tu1", name: "Unit 1", ratio: "5", isBulk: "on" } },
        tiers: {
          "0": {
            id: "t1",
            name: "Tier 1",
            modifier: "2",
            costs: { tu1: "10" },
            progress: { tu1: "1" },
          },
        },
        projects: { "0": { id: "p1", target: "50", rewardType: "item" } },
      };

      vi.mocked(foundry.utils.expandObject).mockReturnValue(mockData);

      // @ts-ignore
      await app.saveFormData();

      expect(game.settings.set).toHaveBeenCalledWith("thefehrs-learning-manager", "rules", {
        method: "direct",
      });
      expect(game.settings.set).toHaveBeenCalledWith("thefehrs-learning-manager", "timeUnits", [
        { id: "tu1", name: "Unit 1", ratio: 5, isBulk: true },
      ]);
      expect(game.settings.set).toHaveBeenCalledWith("thefehrs-learning-manager", "guidanceTiers", [
        { id: "t1", name: "Tier 1", modifier: 2, costs: { tu1: 10 }, progress: { tu1: 1 } },
      ]);
      expect(game.settings.set).toHaveBeenCalledWith(
        "thefehrs-learning-manager",
        "projectTemplates",
        [{ id: "p1", target: 50, rewardType: "item", requirements: [] }],
      );
    });
  });

  describe("Static actions", () => {
    it("addTimeUnit should add a new unit and re-render", async () => {
      const app = new LearningConfigApp();
      app.render = vi.fn();
      vi.mocked(game.settings.get).mockReturnValue([]);

      await LearningConfigApp.addTimeUnit.call(app);

      expect(game.settings.set).toHaveBeenCalledWith(
        "thefehrs-learning-manager",
        "timeUnits",
        expect.arrayContaining([expect.objectContaining({ name: "New Unit" })]),
      );
      expect(app.render).toHaveBeenCalled();
    });

    it("deleteTimeUnit should remove unit and re-render", async () => {
      const app = new LearningConfigApp();
      app.render = vi.fn();
      vi.mocked(game.settings.get).mockReturnValue([{ id: "tu1" }, { id: "tu2" }]);
      const mockTarget = { dataset: { id: "tu1" } } as any;

      await LearningConfigApp.deleteTimeUnit.call(app, new Event("click"), mockTarget);

      expect(game.settings.set).toHaveBeenCalledWith("thefehrs-learning-manager", "timeUnits", [
        { id: "tu2" },
      ]);
      expect(app.render).toHaveBeenCalled();
    });

    it("addTier should add a new tier and re-render", async () => {
      const app = new LearningConfigApp();
      app.render = vi.fn();
      vi.mocked(game.settings.get).mockReturnValue([]);

      await LearningConfigApp.addTier.call(app);

      expect(game.settings.set).toHaveBeenCalledWith(
        "thefehrs-learning-manager",
        "guidanceTiers",
        expect.arrayContaining([expect.objectContaining({ name: "New Tier" })]),
      );
      expect(app.render).toHaveBeenCalled();
    });

    it("deleteTier should remove tier and re-render", async () => {
      const app = new LearningConfigApp();
      app.render = vi.fn();
      vi.mocked(game.settings.get).mockReturnValue([{ id: "t1" }, { id: "t2" }]);
      const mockTarget = { dataset: { id: "t1" } } as any;

      await LearningConfigApp.deleteTier.call(app, new Event("click"), mockTarget);

      expect(game.settings.set).toHaveBeenCalledWith("thefehrs-learning-manager", "guidanceTiers", [
        { id: "t2" },
      ]);
      expect(app.render).toHaveBeenCalled();
    });

    it("addProject should add a new project and re-render", async () => {
      const app = new LearningConfigApp();
      app.render = vi.fn();
      vi.mocked(game.settings.get).mockReturnValue([]);

      await LearningConfigApp.addProject.call(app);

      expect(game.settings.set).toHaveBeenCalledWith(
        "thefehrs-learning-manager",
        "projectTemplates",
        expect.arrayContaining([expect.objectContaining({ name: "New Project" })]),
      );
      expect(app.render).toHaveBeenCalled();
    });

    it("deleteProject should remove project and re-render", async () => {
      const app = new LearningConfigApp();
      app.render = vi.fn();
      vi.mocked(game.settings.get).mockReturnValue([
        { id: "p1", rewardType: "item" },
        { id: "p2", rewardType: "item" },
      ]);
      const mockTarget = { dataset: { id: "p1" } } as any;

      // Ensure game.actors is an array and doesn't contain the project
      game.actors = new ActorsCollection();

      await LearningConfigApp.deleteProject.call(app, new Event("click"), mockTarget);

      expect(game.settings.set).toHaveBeenCalledWith(
        "thefehrs-learning-manager",
        "projectTemplates",
        [{ id: "p2", rewardType: "item" }],
      );
      expect(app.render).toHaveBeenCalled();
    });

    it("saveFormData should handle missing data gracefully", async () => {
      const app = new LearningConfigApp();
      const mockForm = document.createElement("form");
      // @ts-ignore
      app.element = mockForm;

      vi.mocked(foundry.utils.expandObject).mockReturnValue({});

      // @ts-ignore
      await app.saveFormData();

      // Should still call sets with defaults or empty arrays
      expect(game.settings.set).toHaveBeenCalled();
    });
  });
});
