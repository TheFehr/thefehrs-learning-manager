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
    return this.actor.prototypeToken?.texture?.src ?? this.actor.img;
  }

  get uuid(): string {
    return this.actor.uuid;
  }

  get projects(): LearningProject[] {
    return this.actor.getFlag("thefehrs-learning-manager", "projects") || [];
  }

  getMappedProjects() {
    return this.actor.items
      .filter((i) => i.getFlag("thefehrs-learning-manager", "isLearningProject"))
      .map((i) => {
        const projectData = i.getFlag("thefehrs-learning-manager", "projectData");
        const guidanceTiers = Settings.get("guidanceTiers");
        const tier = guidanceTiers.find((t) => t.id === projectData?.tutelageId);
        return {
          id: i.id,
          name: i.name,
          progress: projectData?.progress ?? 0,
          target: projectData?.target ?? 0,
          percentage:
            projectData && projectData.target && projectData.target > 0
              ? Math.min(100, Math.round(((projectData.progress ?? 0) / projectData.target) * 100))
              : 0,
          tutelageName: tier?.name ?? "None",
        };
      });
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
    return await this.actor.update(data);
  }

  async createEmbeddedDocuments(type: any, data: object[]): Promise<any[]> {
    return await this.actor.createEmbeddedDocuments(type, data as any[]);
  }

  async deleteEmbeddedDocuments(type: any, ids: string[]): Promise<any[]> {
    return await this.actor.deleteEmbeddedDocuments(type, ids);
  }

  get currency(): { gp: number; sp: number; cp: number } {
    const currency = (this.actor as LearningActor).system?.currency;
    return {
      gp: currency?.gp ?? 0,
      sp: currency?.sp ?? 0,
      cp: currency?.cp ?? 0,
    };
  }

  async updateCurrency(currency: { gp: number; sp: number; cp: number }): Promise<Actor> {
    return await this.actor.update({
      system: {
        currency,
      },
    });
  }

  static forActor(actor: Actor5e): ActorProxy {
    return new ActorProxy(actor);
  }
}
