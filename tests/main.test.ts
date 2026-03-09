import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TheFehrsLearningManager } from "../src/main";
import { ActorProxy } from "../src/actor-proxy";
import { TabLogic } from "../src/tabs/tab-logic";
import { LearningTab } from "../src/tabs/learning-tab";
import { PartyTab } from "../src/tabs/party-tab";
import type { TimeUnit } from "../src/types";

describe("TheFehrsLearningManager", () => {
  const timeUnits: TimeUnit[] = [
    { id: "tu_hr", name: "Hour", short: "h", isBulk: false, ratio: 1 },
    { id: "tu_day", name: "Day", short: "d", isBulk: true, ratio: 10 },
    { id: "tu_wk", name: "Week", short: "w", isBulk: true, ratio: 70 },
  ];

  describe("formatTimeBank", () => {
    it('should return "0" for 0 or negative units', () => {
      expect(TabLogic.formatTimeBank(0, timeUnits)).toBe("0");
      expect(TabLogic.formatTimeBank(-5, timeUnits)).toBe("0");
    });

    it('should return "0" for empty timeUnits', () => {
      expect(TabLogic.formatTimeBank(10, [])).toBe("0");
    });

    it("should format units correctly based on ratios", () => {
      // 1 hour
      expect(TabLogic.formatTimeBank(1, timeUnits)).toBe("1h");
      // 10 hours = 1 day
      expect(TabLogic.formatTimeBank(10, timeUnits)).toBe("1d");
      // 11 hours = 1 day 1 hour
      expect(TabLogic.formatTimeBank(11, timeUnits)).toBe("1d 1h");
      // 70 hours = 1 week
      expect(TabLogic.formatTimeBank(70, timeUnits)).toBe("1w");
      // 81 hours = 1 week 1 day 1 hour
      expect(TabLogic.formatTimeBank(81, timeUnits)).toBe("1w 1d 1h");
    });

    it("should handle units that are not in order", () => {
      const unsortedUnits = [
        { id: "tu_hr", name: "Hour", short: "h", isBulk: false, ratio: 1 },
        { id: "tu_wk", name: "Week", short: "w", isBulk: true, ratio: 70 },
        { id: "tu_day", name: "Day", short: "d", isBulk: true, ratio: 10 },
      ];
      expect(TabLogic.formatTimeBank(81, unsortedUnits)).toBe("1w 1d 1h");
    });
  });

  describe("init", () => {
    it("should register settings and helpers", () => {
      TheFehrsLearningManager.init();
      expect(game.settings.registerMenu).toHaveBeenCalled();
      expect(Handlebars.registerHelper).toHaveBeenCalledWith("eq", expect.any(Function));
      expect(Handlebars.registerHelper).toHaveBeenCalledWith("array", expect.any(Function));
    });
  });

  describe("registerSettings", () => {
    it("should register world settings", () => {
      TheFehrsLearningManager.registerSettings();
      expect(game.settings.register).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "rules",
        expect.objectContaining({ scope: "world", config: false }),
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "timeUnits",
        expect.objectContaining({ scope: "world", config: false }),
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "guidanceTiers",
        expect.objectContaining({ scope: "world", config: false }),
      );
      expect(game.settings.register).toHaveBeenCalledWith(
        TheFehrsLearningManager.ID,
        "projectTemplates",
        expect.objectContaining({ scope: "world", config: false }),
      );
    });
  });

  describe("prepareActorData", () => {
    it("should return correct data for actor", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        [TheFehrsLearningManager.ID]: {
          bank: { total: 15 },
          projects: [
            { id: "p1", templateId: "tpl1", progress: 5 },
            { id: "p2", templateId: "tpl2", progress: 10 },
          ],
        },
      };

      vi.mocked(game.settings.get).mockImplementation((scope, key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "projectTemplates")
          return [
            { id: "tpl1", name: "Project 1", target: 10 },
            { id: "tpl2", name: "Project 2", target: 10 },
          ];
        if (key === "guidanceTiers") return [];
        return null;
      });

      // @ts-ignore
      const data = await LearningTab.getData(actor);

      expect(data.formattedBank).toBe("1d 5h");
      expect(data.activeProjects).toHaveLength(1);
      expect(data.activeProjects[0].id).toBe("p1");
      expect(data.completedProjects).toHaveLength(1);
      expect(data.completedProjects[0].id).toBe("p2");
    });

    it("should handle missing flags gracefully", async () => {
      const actor = new Actor() as any;
      vi.mocked(game.settings.get).mockReturnValue([]);

      // @ts-ignore
      const data = await LearningTab.getData(actor);

      expect(data.formattedBank).toBe("0");
      expect(data.activeProjects).toHaveLength(0);
      expect(data.completedProjects).toHaveLength(0);
    });
  });

  describe("preparePartyData", () => {
    it("should return correct data for party actor", async () => {
      const partyActor = {
        system: {
          members: [{ id: "m1" }],
        },
      } as any;

      const memberActor = new Actor() as any;
      memberActor.id = "m1";
      memberActor.name = "Member 1";
      memberActor.img = "path/to/img";
      memberActor.flags = {
        [TheFehrsLearningManager.ID]: {
          bank: { total: 10 },
          projects: [],
        },
      };

      vi.mocked(game.actors.get).mockReturnValue(memberActor as any);
      vi.mocked(game.settings.get).mockImplementation((scope, key) => {
        if (key === "timeUnits") return timeUnits;
        if (key === "guidanceTiers") return [];
        return null;
      });

      // @ts-ignore
      const data = await PartyTab.getData(partyActor);

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
      // @ts-ignore
      TabLogic.activateListeners(html, actor);

      // Trigger it.
      const processTrainingSpy = vi
        // @ts-ignore
        .spyOn(TabLogic, "processTraining")
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
        { id: "tpl1", name: "Template 1", target: 100, requirements: [] },
      ]);

      // @ts-ignore
      TabLogic.activateListeners(html, actor);

      btn.dispatchEvent(new MouseEvent("click"));

      // Wait for async listeners
      await vi.waitFor(() => {
        expect(actor.setFlag).toHaveBeenCalledWith(
          TheFehrsLearningManager.ID,
          "projects",
          expect.arrayContaining([
            expect.objectContaining({
              templateId: "tpl1",
              progress: 0,
              isCompleted: false,
            }),
          ]),
        );
      });
    });
  });

  describe("meetsRequirements", () => {
    it("should return true for empty requirements", () => {
      const actor = new Actor() as any;
      // @ts-ignore
      const result = TabLogic.meetsRequirements(actor, []);
      expect(result.eligible).toBe(true);
    });

    it("should handle numeric comparisons correctly", () => {
      const actor = { system: { abilities: { str: { value: 15 } } } } as any;

      // @ts-ignore
      expect(
        TabLogic.meetsRequirements(actor, [
          { attribute: "system.abilities.str.value", operator: ">=", value: "15" },
        ]).eligible,
      ).toBe(true);

      // @ts-ignore
      expect(
        TabLogic.meetsRequirements(actor, [
          { attribute: "system.abilities.str.value", operator: ">", value: "15" },
        ]).eligible,
      ).toBe(false);

      // @ts-ignore
      expect(
        TabLogic.meetsRequirements(actor, [
          { attribute: "system.abilities.str.value", operator: "<", value: "20" },
        ]).eligible,
      ).toBe(true);
    });

    it("should handle string and array inclusion", () => {
      const actor = { system: { traits: { languages: ["common", "elvish"] } } } as any;

      // @ts-ignore
      expect(
        TabLogic.meetsRequirements(actor, [
          { attribute: "system.traits.languages", operator: "includes", value: "common" },
        ]).eligible,
      ).toBe(true);

      // @ts-ignore
      expect(
        TabLogic.meetsRequirements(actor, [
          { attribute: "system.traits.languages", operator: "includes", value: "orcish" },
        ]).eligible,
      ).toBe(false);
    });
  });

  describe("grantProjectReward", () => {
    let originalItem: any;

    beforeEach(() => {
      originalItem = globalThis.Item;
    });

    afterEach(() => {
      globalThis.Item = originalItem;
    });

    it("should create embedded item document for item rewards", async () => {
      const actor = new Actor() as any;
      const template = {
        name: "Test",
        target: 10,
        rewardUuid: "item-uuid",
        rewardType: "item",
      };

      const mockItem = {
        name: "Mock Item",
        toObject: () => ({ name: "Mock Item" }),
      };
      // @ts-ignore
      globalThis.Item = class {
        constructor() {
          Object.assign(this, mockItem);
        }
        static [Symbol.hasInstance](instance) {
          return true;
        }
      };
      vi.mocked(fromUuid).mockResolvedValue(new (globalThis.Item as any)());

      // @ts-ignore
      await TabLogic.grantProjectReward(actor, template);

      expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ name: "Mock Item" }]);
    });
  });

  describe("deductCurrency", () => {
    beforeEach(() => {
      vi.mocked(Actor.prototype.update).mockClear();
    });

    it("should deduct currency correctly and return true", async () => {
      const actor = new Actor() as any;
      actor.system = { currency: { gp: 10, sp: 0, cp: 0 } };

      // @ts-ignore
      const result = await TabLogic.deductCurrency(actor, 155);

      expect(result).toBe(true);
      expect(actor.update).toHaveBeenCalledWith({
        system: {
          currency: {
            gp: 8,
            sp: 4,
            cp: 5,
          },
        },
      });
    });

    it("should return false if actor cannot afford the cost", async () => {
      const actor = new Actor() as any;
      actor.system = { currency: { gp: 1, sp: 0, cp: 0 } };

      // @ts-ignore
      const result = await TabLogic.deductCurrency(actor, 200);

      expect(result).toBe(false);
      expect(actor.update).not.toHaveBeenCalled();
    });
  });

  describe("ActorProxy", () => {
    it("should correctly wrap actor methods", async () => {
      const actor = new Actor() as any;
      actor.flags = {
        [TheFehrsLearningManager.ID]: {
          bank: { total: 10 },
          projects: [{ id: "p1", templateId: "tpl1" }],
        },
      };
      actor.system = { currency: { gp: 5, sp: 2, cp: 3 } };

      const proxy = new ActorProxy(actor);

      expect(proxy.bank.total).toBe(10);
      expect(proxy.projects).toHaveLength(1);
      expect(proxy.currency.gp).toBe(5);

      await proxy.setBank({ total: 20 });
      expect(actor.setFlag).toHaveBeenCalledWith(TheFehrsLearningManager.ID, "bank", { total: 20 });

      await proxy.updateCurrency({ gp: 10, sp: 0, cp: 0 });
      expect(actor.update).toHaveBeenCalledWith({
        system: { currency: { gp: 10, sp: 0, cp: 0 } },
      });
    });
  });
});
