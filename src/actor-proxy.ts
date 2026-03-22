import type { TimeBank, LearningActor, LearningProject, Actor5e } from "./types.js";
import { Settings } from "./core/settings.js";

export class ActorProxy {
  private actor: Actor5e;

  constructor(actor: Actor5e) {
    this.actor = actor;
  }

  get id(): string {
    return this.actor.id ?? "";
  }

  get name(): string {
    return this.actor.name ?? "";
  }

  get img(): string | null {
    return this.actor.img;
  }

  get tokenImg(): string | null {
    const actor = this.actor as unknown as {
      prototypeToken?: { texture?: { src?: string } };
      img: string | null;
    };
    return actor.prototypeToken?.texture?.src || actor.img;
  }

  get uuid(): string {
    return this.actor.uuid;
  }

  get projects(): LearningProject[] {
    return this.actor.getFlag("thefehrs-learning-manager", "projects") || [];
  }

  async setProjects(projects: LearningProject[]): Promise<Actor> {
    return await this.actor.setFlag("thefehrs-learning-manager", "projects", projects);
  }

  get bank(): TimeBank {
    return this.actor.getFlag("thefehrs-learning-manager", "bank") || { total: 0 };
  }

  async setBank(bank: TimeBank): Promise<Actor> {
    return await this.actor.setFlag("thefehrs-learning-manager", "bank", bank);
  }

  async update(data: object): Promise<Actor> {
    return await (this.actor as unknown as Actor).update(data);
  }

  async createEmbeddedDocuments(type: string, data: object[]): Promise<any[]> {
    return await (this.actor as unknown as Actor).createEmbeddedDocuments(
      type as never,
      data as never,
    );
  }

  async deleteEmbeddedDocuments(type: string, ids: string[]): Promise<any[]> {
    return await (this.actor as unknown as Actor).deleteEmbeddedDocuments(
      type as never,
      ids as never,
    );
  }

  get currency(): { gp: number; sp: number; cp: number } {
    const currency = (this.actor as unknown as LearningActor).system?.currency;
    return {
      gp: currency?.gp ?? 0,
      sp: currency?.sp ?? 0,
      cp: currency?.cp ?? 0,
    };
  }

  async updateCurrency(currency: { gp: number; sp: number; cp: number }): Promise<Actor> {
    return await (this.actor as unknown as Actor).update({
      system: {
        currency,
      },
    });
  }

  static forActor(actor: Actor): ActorProxy {
    return new ActorProxy(actor as unknown as Actor5e);
  }
}
