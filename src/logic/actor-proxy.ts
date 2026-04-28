import type { TimeBank, Actor5e, Item5e, LearningActor } from "@/types.js";
import type { ProjectFlagData } from "./project-item.js";
import { DocumentUtils } from "@/core/document-utils.js";
import { MODULE_ID } from "@/global.js";

export class ActorProxy {
  private actor: Actor5e;

  constructor(actor: Actor5e) {
    this.actor = actor;
  }

  get id(): string {
    return this.actor.id;
  }

  get name(): string {
    return this.actor.name || "Unknown";
  }

  get bank(): TimeBank {
    return (
      (this.actor.getFlag(MODULE_ID, "bank") as TimeBank) || {
        total: 0,
      }
    );
  }

  get currency(): { cp: number; sp: number; ep: number; gp: number; pp: number } {
    return (this.actor as any).system.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  }

  get projects(): Item5e[] {
    return (this.actor as any).items.filter((i: Item5e) =>
      i.getFlag(MODULE_ID, "isLearningProject"),
    );
  }

  async setBank(bank: TimeBank): Promise<LearningActor> {
    return (await this.actor.setFlag(MODULE_ID, "bank", bank)) as LearningActor;
  }

  async updateProject(
    itemId: string,
    projectData: Partial<ProjectFlagData>,
  ): Promise<Item5e | null> {
    const item = (this.actor as any).items.get(itemId);
    if (!item) return null;

    const currentData = (item.getFlag(MODULE_ID, "projectData") as ProjectFlagData) || {};
    const updatedData = DocumentUtils.mergeObject(currentData, projectData);

    return (await item.setFlag(MODULE_ID, "projectData", updatedData)) as Item5e;
  }

  async updateCurrency(
    currency: { cp: number; sp: number; ep: number; gp: number; pp: number },
    options: { render?: boolean } = {},
  ): Promise<Actor5e> {
    const updateData = {
      "system.currency.cp": Number(currency.cp || 0),
      "system.currency.sp": Number(currency.sp || 0),
      "system.currency.ep": Number(currency.ep || 0),
      "system.currency.gp": Number(currency.gp || 0),
      "system.currency.pp": Number(currency.pp || 0),
    };

    return (await (this.actor as any).update(updateData, options)) as Actor5e;
  }

  static forActor(actor: Actor5e): ActorProxy {
    return new ActorProxy(actor);
  }
}
