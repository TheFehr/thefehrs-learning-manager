import { describe, it, expect, vi } from "vitest";
import { TheFehrsLearningManager } from "../src/main";
import type { TimeUnit } from "../src/types";

describe("TheFehrsLearningManager", () => {
  const timeUnits: TimeUnit[] = [
    { id: "tu_hr", name: "Hour", short: "h", isBulk: false, ratio: 1 },
    { id: "tu_day", name: "Day", short: "d", isBulk: true, ratio: 10 },
    { id: "tu_wk", name: "Week", short: "w", isBulk: true, ratio: 70 },
  ];

  describe("formatTimeBank", () => {
    it('should return "0" for 0 or negative units', () => {
      expect(TheFehrsLearningManager.formatTimeBank(0, timeUnits)).toBe("0");
      expect(TheFehrsLearningManager.formatTimeBank(-5, timeUnits)).toBe("0");
    });

    it("should format units correctly based on ratios", () => {
      // 1 hour
      expect(TheFehrsLearningManager.formatTimeBank(1, timeUnits)).toBe("1h");
      // 10 hours = 1 day
      expect(TheFehrsLearningManager.formatTimeBank(10, timeUnits)).toBe("1d");
      // 11 hours = 1 day 1 hour
      expect(TheFehrsLearningManager.formatTimeBank(11, timeUnits)).toBe("1d 1h");
      // 70 hours = 1 week
      expect(TheFehrsLearningManager.formatTimeBank(70, timeUnits)).toBe("1w");
      // 81 hours = 1 week 1 day 1 hour
      expect(TheFehrsLearningManager.formatTimeBank(81, timeUnits)).toBe("1w 1d 1h");
    });

    it("should handle units that are not in order", () => {
      const unsortedUnits = [
        { id: "tu_hr", name: "Hour", short: "h", isBulk: false, ratio: 1 },
        { id: "tu_wk", name: "Week", short: "w", isBulk: true, ratio: 70 },
        { id: "tu_day", name: "Day", short: "d", isBulk: true, ratio: 10 },
      ];
      expect(TheFehrsLearningManager.formatTimeBank(81, unsortedUnits)).toBe("1w 1d 1h");
    });
  });

  describe("init", () => {
    it("should register settings and helpers", () => {
      TheFehrsLearningManager.init();
      expect(game.settings.registerMenu).toHaveBeenCalled();
      expect(Handlebars.registerHelper).toHaveBeenCalledWith("eq", expect.any(Function));
    });
  });

  describe("registerSettings", () => {
    it("should register world settings", () => {
      TheFehrsLearningManager.registerSettings();
      expect(game.settings.register).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "rules",
        expect.any(Object),
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "timeUnits",
        expect.any(Object),
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "guidanceTiers",
        expect.any(Object),
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "projectTemplates",
        expect.any(Object),
      );
    });
  });

  describe("prepareActorData", () => {
    it("should return correct data for actor", async () => {
      const actor = {
        getFlag: vi.fn((scope, key) => {
          if (key === "bank") return { total: 15 };
          if (key === "projects")
            return [
              { id: "p1", name: "Project 1", progress: 5, maxProgress: 10 },
              { id: "p2", name: "Project 2", progress: 10, maxProgress: 10 },
            ];
          return null;
        }),
      } as any;

      vi.mocked(game.settings.get).mockImplementation((scope, key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "projectTemplates") return [];
        if (key === "guidanceTiers") return [];
        return null;
      });

      const data = await (TheFehrsLearningManager as any).prepareActorData(actor);

      expect(data.formattedBank).toBe("1d 5h");
      expect(data.activeProjects).toHaveLength(1);
      expect(data.activeProjects[0].id).toBe("p1");
      expect(data.completedProjects).toHaveLength(1);
      expect(data.completedProjects[0].id).toBe("p2");
    });
  });

  describe("preparePartyData", () => {
    it("should return correct data for party actor", async () => {
      const partyActor = {
        system: {
          members: [{ id: "m1" }],
        },
      } as any;

      const memberActor = {
        id: "m1",
        name: "Member 1",
        img: "path/to/img",
        getFlag: vi.fn((scope, key) => {
          if (key === "bank") return { total: 10 };
          if (key === "projects") return [];
          return null;
        }),
      };

      vi.mocked(game.actors.get).mockReturnValue(memberActor as any);
      vi.mocked(game.settings.get).mockImplementation((scope, key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "guidanceTiers") return [];
        return null;
      });

      const data = await (TheFehrsLearningManager as any).preparePartyData(partyActor);

      expect(data.members).toHaveLength(1);
      expect(data.members[0].id).toBe("m1");
      expect(data.members[0].formattedBank).toBe("1d");
    });
  });

  describe("activateListeners", () => {
    it("should attach click listener to bulk-train buttons", () => {
      const html = document.createElement("div");
      html.innerHTML = '<button class="bulk-train" data-id="p1" data-unit="tu_hr"></button>';
      const btn = html.querySelector(".bulk-train")!;

      const actor = { id: "a1" };
      (TheFehrsLearningManager as any).activateListeners(html, actor);

      // We can't easily test if the listener was added without spying on addEventListener
      // before calling activateListeners, or triggering the event.
      // Let's trigger it.
      const processTrainingSpy = vi
        .spyOn(TheFehrsLearningManager as any, "processTraining")
        .mockResolvedValue(undefined);

      btn.dispatchEvent(new MouseEvent("click"));

      expect(processTrainingSpy).toHaveBeenCalledWith(actor, "p1", "tu_hr");
    });

    it("should attach click listener to add-selected-project button", async () => {
      const html = document.createElement("div");
      html.innerHTML = `
        <select class="project-selector"><option value="tpl1">Tpl 1</option></select>
        <button class="add-selected-project"></button>
      `;
      const btn = html.querySelector(".add-selected-project")!;
      const actor = {
        getFlag: vi.fn().mockReturnValue([]),
        setFlag: vi.fn().mockResolvedValue(undefined),
      } as any;

      vi.mocked(game.settings.get).mockReturnValue([
        { id: "tpl1", name: "Template 1", target: 100 },
      ]);

      (TheFehrsLearningManager as any).activateListeners(html, actor);

      btn.dispatchEvent(new MouseEvent("click"));

      // Wait for async listeners
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(actor.setFlag).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "projects",
        expect.arrayContaining([expect.objectContaining({ name: "Template 1" })]),
      );
    });
  });
});
