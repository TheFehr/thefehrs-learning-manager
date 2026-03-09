import type { LearningProject, TimeBank, DowntimeActor } from "./types";
import { Settings } from "./settings";

export class ActorProxy {
  private actor: Actor;

  constructor(actor: Actor) {
    this.actor = actor;
  }

  get id(): string {
    return this.actor.id!;
  }

  get name(): string {
    return this.actor.name!;
  }

  get img(): string | null {
    return this.actor.img;
  }

  get tokenImg(): string | null {
    return (this.actor as any).prototypeToken?.texture?.src || this.actor.img;
  }

  get uuid(): string {
    return this.actor.uuid;
  }

  get projects(): LearningProject[] {
    return this.actor.getFlag(Settings.ID, "projects") || [];
  }

  async setProjects(projects: LearningProject[]): Promise<Actor> {
    return await this.actor.setFlag(Settings.ID, "projects", projects);
  }

  get bank(): TimeBank {
    return this.actor.getFlag(Settings.ID, "bank") || { total: 0 };
  }

  async setBank(bank: TimeBank): Promise<Actor> {
    return await this.actor.setFlag(Settings.ID, "bank", bank);
  }

  async update(data: any): Promise<Actor> {
    return await this.actor.update(data);
  }

  async createEmbeddedDocuments(type: string, data: any[]): Promise<any[]> {
    return await (this.actor as any).createEmbeddedDocuments(type, data);
  }

  get currency(): { gp: number; sp: number; cp: number } {
    return (this.actor as DowntimeActor).system.currency || { gp: 0, sp: 0, cp: 0 };
  }

  async updateCurrency(currency: { gp: number; sp: number; cp: number }): Promise<Actor> {
    return await this.actor.update({
      system: {
        currency,
      },
    });
  }

  static forActor(actor: Actor): ActorProxy {
    return new ActorProxy(actor);
  }
}
