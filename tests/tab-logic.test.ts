import { describe, it, expect, vi, beforeEach } from "vitest";
import { TabLogic } from "../src/tabs/tab-logic";

describe("TabLogic", () => {
  describe("computeProgress", () => {
    let mockActor: any;

    beforeEach(() => {
      mockActor = {
        getRollData: vi.fn().mockReturnValue({ mod: 2 }),
      };

      globalThis.Roll = class {
        formula: string;
        data: any;
        dice: any[];
        total: number;

        constructor(formula: string, data: any) {
          this.formula = formula;
          this.data = data;
          this.dice = [];
          this.total = 0;
        }

        evaluate() {
          return Promise.resolve(this);
        }
      } as any;
    });

    it("should compute progress for bulk time unit", async () => {
      const tu = { id: "tu1", isBulk: true };
      const tier = { progress: { tu1: 5 } };
      const rules = {};

      const { progressGained } = await TabLogic.computeProgress(mockActor as any, rules, tier, tu);
      expect(progressGained).toBe(5);
    });

    it("should return default progress 1 for direct method", async () => {
      const tu = { id: "tu1", isBulk: false };
      const tier = {};
      const rules = { method: "direct" };

      const { progressGained } = await TabLogic.computeProgress(mockActor as any, rules, tier, tu);
      expect(progressGained).toBe(1);
    });

    describe("roll method", () => {
      it("should return 1 progress if roll meets DC and no crit strategy", async () => {
        const tu = { id: "tu1", isBulk: false };
        const tier = { modifier: 1 };
        const rules = { method: "roll", checkFormula: "1d20", checkDC: 15 };

        const rollInstance = new (globalThis as any).Roll("1d20", {});
        rollInstance.total = 15;
        rollInstance.dice = [{ faces: 20, results: [{ result: 15 }] }];

        (globalThis as any).Roll = class {
          total = rollInstance.total;
          dice = rollInstance.dice;
          evaluate() {
            return Promise.resolve(this);
          }
        };

        const { progressGained, roll } = await TabLogic.computeProgress(
          mockActor as any,
          rules,
          tier,
          tu,
        );
        expect(progressGained).toBe(1);
        expect(roll.total).toBe(15);
      });

      it("should return 0 progress if roll does not meet DC", async () => {
        const tu = { id: "tu1", isBulk: false };
        const tier = { modifier: 1 };
        const rules = { method: "roll", checkFormula: "1d20", checkDC: 15 };

        const rollInstance = new (globalThis as any).Roll("1d20", {});
        rollInstance.total = 10;
        rollInstance.dice = [{ faces: 20, results: [{ result: 10 }] }];

        (globalThis as any).Roll = class {
          total = rollInstance.total;
          dice = rollInstance.dice;
          evaluate() {
            return Promise.resolve(this);
          }
        };

        const { progressGained } = await TabLogic.computeProgress(
          mockActor as any,
          rules,
          tier,
          tu,
        );
        expect(progressGained).toBe(0);
      });

      describe("critDoubleStrategy: any", () => {
        it("should return 2 progress if any die meets threshold", async () => {
          const tu = { id: "tu1", isBulk: false };
          const tier = { modifier: 1 };
          const rules = {
            method: "roll",
            checkFormula: "2d20",
            checkDC: 15,
            critDoubleStrategy: "any",
            critThreshold: 19,
          };

          const rollInstance = new (globalThis as any).Roll("2d20", {});
          rollInstance.total = 20;
          rollInstance.dice = [
            { faces: 20, results: [{ result: 10 }] },
            { faces: 20, results: [{ result: 19 }] },
          ];

          (globalThis as any).Roll = class {
            total = rollInstance.total;
            dice = rollInstance.dice;
            evaluate() {
              return Promise.resolve(this);
            }
          };

          const { progressGained } = await TabLogic.computeProgress(
            mockActor as any,
            rules,
            tier,
            tu,
          );
          expect(progressGained).toBe(2);
        });

        it("should return 1 progress if no die meets threshold", async () => {
          const tu = { id: "tu1", isBulk: false };
          const tier = { modifier: 1 };
          const rules = {
            method: "roll",
            checkFormula: "2d20",
            checkDC: 15,
            critDoubleStrategy: "any",
            critThreshold: 19,
          };

          const rollInstance = new (globalThis as any).Roll("2d20", {});
          rollInstance.total = 20;
          rollInstance.dice = [
            { faces: 20, results: [{ result: 10 }] },
            { faces: 20, results: [{ result: 18 }] },
          ];

          (globalThis as any).Roll = class {
            total = rollInstance.total;
            dice = rollInstance.dice;
            evaluate() {
              return Promise.resolve(this);
            }
          };

          const { progressGained } = await TabLogic.computeProgress(
            mockActor as any,
            rules,
            tier,
            tu,
          );
          expect(progressGained).toBe(1);
        });

        it("should return 2 progress if any die meets threshold in a multi-die term (e.g. 2d20)", async () => {
          const tu = { id: "tu1", isBulk: false };
          const tier = { modifier: 1 };
          const rules = {
            method: "roll",
            checkFormula: "2d20",
            checkDC: 15,
            critDoubleStrategy: "any",
            critThreshold: 19,
          };

          const rollInstance = new (globalThis as any).Roll("2d20", {});
          rollInstance.total = 29;
          rollInstance.dice = [{ faces: 20, results: [{ result: 10 }, { result: 19 }] }];

          (globalThis as any).Roll = class {
            total = rollInstance.total;
            dice = rollInstance.dice;
            evaluate() {
              return Promise.resolve(this);
            }
          };

          const { progressGained } = await TabLogic.computeProgress(
            mockActor as any,
            rules,
            tier,
            tu,
          );
          expect(progressGained).toBe(2);
        });
      });

      describe("critDoubleStrategy: all", () => {
        it("should return 2 progress if all dice meet threshold", async () => {
          const tu = { id: "tu1", isBulk: false };
          const tier = { modifier: 1 };
          const rules = {
            method: "roll",
            checkFormula: "2d20",
            checkDC: 15,
            critDoubleStrategy: "all",
            critThreshold: 19,
          };

          const rollInstance = new (globalThis as any).Roll("2d20", {});
          rollInstance.total = 38;
          rollInstance.dice = [
            { faces: 20, results: [{ result: 19 }] },
            { faces: 20, results: [{ result: 20 }] },
          ];

          (globalThis as any).Roll = class {
            total = rollInstance.total;
            dice = rollInstance.dice;
            evaluate() {
              return Promise.resolve(this);
            }
          };

          const { progressGained } = await TabLogic.computeProgress(
            mockActor as any,
            rules,
            tier,
            tu,
          );
          expect(progressGained).toBe(2);
        });

        it("should return 1 progress if not all dice meet threshold", async () => {
          const tu = { id: "tu1", isBulk: false };
          const tier = { modifier: 1 };
          const rules = {
            method: "roll",
            checkFormula: "2d20",
            checkDC: 15,
            critDoubleStrategy: "all",
            critThreshold: 19,
          };

          const rollInstance = new (globalThis as any).Roll("2d20", {});
          rollInstance.total = 30;
          rollInstance.dice = [
            { faces: 20, results: [{ result: 19 }] },
            { faces: 20, results: [{ result: 10 }] },
          ];

          (globalThis as any).Roll = class {
            total = rollInstance.total;
            dice = rollInstance.dice;
            evaluate() {
              return Promise.resolve(this);
            }
          };

          const { progressGained } = await TabLogic.computeProgress(
            mockActor as any,
            rules,
            tier,
            tu,
          );
          expect(progressGained).toBe(1);
        });

        it("should return 2 progress if all dice meet threshold in a multi-die term", async () => {
          const tu = { id: "tu1", isBulk: false };
          const tier = { modifier: 1 };
          const rules = {
            method: "roll",
            checkFormula: "2d20",
            checkDC: 15,
            critDoubleStrategy: "all",
            critThreshold: 19,
          };

          const rollInstance = new (globalThis as any).Roll("2d20", {});
          rollInstance.total = 39;
          rollInstance.dice = [{ faces: 20, results: [{ result: 19 }, { result: 20 }] }];

          (globalThis as any).Roll = class {
            total = rollInstance.total;
            dice = rollInstance.dice;
            evaluate() {
              return Promise.resolve(this);
            }
          };

          const { progressGained } = await TabLogic.computeProgress(
            mockActor as any,
            rules,
            tier,
            tu,
          );
          expect(progressGained).toBe(2);
        });

        it("should return 1 progress if not all dice meet threshold in a multi-die term", async () => {
          const tu = { id: "tu1", isBulk: false };
          const tier = { modifier: 1 };
          const rules = {
            method: "roll",
            checkFormula: "2d20",
            checkDC: 15,
            critDoubleStrategy: "all",
            critThreshold: 19,
          };

          const rollInstance = new (globalThis as any).Roll("2d20", {});
          rollInstance.total = 29;
          rollInstance.dice = [{ faces: 20, results: [{ result: 19 }, { result: 10 }] }];

          (globalThis as any).Roll = class {
            total = rollInstance.total;
            dice = rollInstance.dice;
            evaluate() {
              return Promise.resolve(this);
            }
          };

          const { progressGained } = await TabLogic.computeProgress(
            mockActor as any,
            rules,
            tier,
            tu,
          );
          expect(progressGained).toBe(1);
        });
      });

      describe("critDoubleStrategy: never", () => {
        it("should return 1 progress even if a die meets threshold", async () => {
          const tu = { id: "tu1", isBulk: false };
          const tier = { modifier: 1 };
          const rules = {
            method: "roll",
            checkFormula: "1d20",
            checkDC: 15,
            critDoubleStrategy: "never",
            critThreshold: 19,
          };

          const rollInstance = new (globalThis as any).Roll("1d20", {});
          rollInstance.total = 20;
          rollInstance.dice = [{ faces: 20, results: [{ result: 20 }] }];

          (globalThis as any).Roll = class {
            total = rollInstance.total;
            dice = rollInstance.dice;
            evaluate() {
              return Promise.resolve(this);
            }
          };

          const { progressGained } = await TabLogic.computeProgress(
            mockActor as any,
            rules,
            tier,
            tu,
          );
          expect(progressGained).toBe(1);
        });
      });
    });
  });

  describe("activateListeners update-project-progress", () => {
    it("should rollback granted rewards if setProjects throws", async () => {
      const mockActor = new (globalThis as any).Actor();
      mockActor.id = "actor1";
      (globalThis as any).game.actors.length = 0;
      (globalThis as any).game.actors.push(mockActor);
      (globalThis as any).game.user.isGM = true;

      const { ActorProxy } = await import("../src/actor-proxy");
      const { Settings } = await import("../src/settings");

      const proxy = new ActorProxy(mockActor);
      const project = {
        id: "proj1",
        templateId: "tpl1",
        progress: 0,
        isCompleted: false,
        guidanceTierId: "",
      };
      Object.defineProperty(proxy, "projects", { get: () => [project] });
      proxy.setProjects = vi.fn().mockRejectedValue(new Error("Database error"));
      proxy.deleteEmbeddedDocuments = vi.fn().mockResolvedValue([]);
      proxy.createEmbeddedDocuments = vi.fn().mockResolvedValue([{ _id: "newitem1" }]);

      vi.spyOn(ActorProxy, "forActor").mockReturnValue(proxy);

      vi.spyOn(Settings, "projectTemplates", "get").mockReturnValue([
        { id: "tpl1", target: 10, rewardUuid: "Item.id", rewardType: "item", name: "Test Tpl" },
      ] as any);

      const item = new (globalThis as any).Item();
      item.name = "Test Item";
      item.toObject = () => ({ name: "Test Item" });
      (globalThis as any).fromUuid = vi.fn().mockResolvedValue(item);

      const html = document.createElement("div");
      html.innerHTML = `<input class="update-project-progress" data-actor-id="actor1" data-project-id="proj1" value="10" />`;

      const input = html.querySelector(".update-project-progress") as HTMLInputElement;

      let listener: any;
      input.addEventListener = vi.fn().mockImplementation((type: string, cb: any) => {
        if (type === "change") listener = cb;
      });

      TabLogic.activateListeners(html, mockActor as any);

      expect(listener).toBeDefined();

      const ev = new Event("change");
      Object.defineProperty(ev, "currentTarget", { value: input, enumerable: true });

      await expect(listener(ev)).rejects.toThrow("Database error");

      expect(project.isCompleted).toBe(false);
      expect(proxy.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["newitem1"]);
    });
  });
});
