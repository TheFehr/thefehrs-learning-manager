import type { TimeBank, LearningActor, LearningProject, Actor5e } from "../types.js";
import { Settings } from "../core/settings.js";
import { DocumentUtils } from "../core/document-utils.js";

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
        return {
          id: i.id,
          name: i.name,
          progress: projectData?.progress ?? 0,
          target: projectData?.target ?? 0,
          percentage:
            projectData && projectData.target && projectData.target > 0
              ? Math.min(100, Math.round(((projectData.progress ?? 0) / projectData.target) * 100))
              : 0,
          tutelageName: projectData?.lastInstructorName ?? "Self-Study",
        };
      });
  }

  async setProjects(
    projects: LearningProject[],
    options: { render?: boolean } = {},
  ): Promise<Actor> {
    if (options.render === false) {
      await DocumentUtils.setFlagsSilently(this.actor, { projects });
      return this.actor as any;
    }
    return await this.actor.setFlag("thefehrs-learning-manager", "projects", projects);
  }

  get bank(): TimeBank {
    return this.actor.getFlag("thefehrs-learning-manager", "bank") || { total: 0 };
  }

  async setBank(bank: TimeBank, options: { render?: boolean } = {}): Promise<Actor> {
    if (options.render === false) {
      await DocumentUtils.setFlagsSilently(this.actor, { bank });
      return this.actor as any;
    }
    return await this.actor.setFlag("thefehrs-learning-manager", "bank", bank);
  }

  async update(data: object, options: { render?: boolean } = {}): Promise<Actor> {
    return await this.actor.update(data, options);
  }

  async createEmbeddedDocuments(type: "Item" | "ActiveEffect", data: object[]): Promise<any[]> {
    return await this.actor.createEmbeddedDocuments(type, data as any[]);
  }

  async deleteEmbeddedDocuments(type: "Item" | "ActiveEffect", ids: string[]): Promise<any[]> {
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

  async updateCurrency(
    currency: { gp: number; sp: number; cp: number },
    options: { render?: boolean } = {},
  ): Promise<Actor> {
    return await this.actor.update(
      {
        system: {
          currency,
        },
      },
      options,
    );
  }

  static forActor(actor: Actor5e): ActorProxy {
    return new ActorProxy(actor);
  }
}
