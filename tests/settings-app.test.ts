import { describe, it, expect, vi, beforeEach } from "vitest";
import { LearningConfigApp } from "../src/settings-app";
import { ActorsCollection } from "./setup";

describe("LearningConfigApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (game.packs as any) = [
      { metadata: { type: "Item", id: "pack1", label: "Pack 1" } },
      { metadata: { type: "Actor", id: "pack2", label: "Pack 2" } },
    ];
  });

  describe("_prepareContext", () => {
    it("should return settings data", async () => {
      vi.mocked(game.settings.get).mockImplementation((_scope, key) => {
        if (key === "timeUnits") return [{ id: "tu1", name: "Unit 1", ratio: 5, isBulk: true }];
        if (key === "guidanceTiers") return [];
        if (key === "rules") return { method: "direct" };
        if (key === "allowedCompendiums") return [];
        return null;
      });

      const app = new LearningConfigApp();
      const context = await (app as any)._prepareContext();

      expect(context.rules.method).toBe("direct");
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
      const form = document.createElement("form");
      form.innerHTML = `
        <input name="rules.method" value="direct" />
        <input name="timeUnits.tu1.id" value="tu1" />
        <input name="timeUnits.tu1.name" value="Unit 1" />
        <input name="timeUnits.tu1.ratio" value="5" />
        <input name="timeUnits.tu1.isBulk" type="checkbox" checked />
        <input name="tiers.t1.id" value="t1" />
        <input name="tiers.t1.name" value="Tier 1" />
        <input name="tiers.t1.modifier" value="2" />
        <input name="tiers.t1.costs.tu1" value="10" />
        <input name="tiers.t1.progress.tu1" value="1" />
      `;
      const app = new LearningConfigApp();
      (app as any).element = form;

      await (app as any).saveFormData();

      expect(game.settings.set).toHaveBeenCalledWith(
        "thefehrs-learning-manager",
        "rules",
        expect.objectContaining({ method: "direct" }),
      );
      expect(game.settings.set).toHaveBeenCalledWith("thefehrs-learning-manager", "timeUnits", [
        { id: "tu1", name: "Unit 1", ratio: 5, isBulk: true },
      ]);
      expect(game.settings.set).toHaveBeenCalledWith("thefehrs-learning-manager", "guidanceTiers", [
        { id: "t1", name: "Tier 1", modifier: 2, costs: { tu1: 10 }, progress: { tu1: 1 } },
      ]);
    });
  });

  describe("Static actions", () => {
    let app: LearningConfigApp;
    beforeEach(() => {
      app = new LearningConfigApp();
      (app as any).element = document.createElement("form");
      vi.spyOn(app, "render").mockImplementation(() => app);
    });

    it("addTimeUnit should add a new unit and re-render", async () => {
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
      const mockTarget = document.createElement("button");
      mockTarget.dataset.id = "tu1";
      vi.mocked(game.settings.get).mockReturnValue([{ id: "tu1" }, { id: "tu2" }]);

      await LearningConfigApp.deleteTimeUnit.call(app, new Event("click"), mockTarget);

      expect(game.settings.set).toHaveBeenCalledWith("thefehrs-learning-manager", "timeUnits", [
        { id: "tu2" },
      ]);
      expect(app.render).toHaveBeenCalled();
    });

    it("addTier should add a new tier and re-render", async () => {
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
      const mockTarget = document.createElement("button");
      mockTarget.dataset.id = "t1";
      vi.mocked(game.settings.get).mockReturnValue([{ id: "t1" }, { id: "t2" }]);

      await LearningConfigApp.deleteTier.call(app, new Event("click"), mockTarget);

      expect(game.settings.set).toHaveBeenCalledWith("thefehrs-learning-manager", "guidanceTiers", [
        { id: "t2" },
      ]);
      expect(app.render).toHaveBeenCalled();
    });
  });
});
