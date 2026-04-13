import type { TimeBank, LearningActor, Actor5e } from "@/types.js";
import { DocumentUtils } from "@/core/document-utils.js";

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

  get projects() {
    return this.getMappedProjects().map((p) => ({
      ...p,
      guidanceType: p.tutelageName,
    }));
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

  get bank(): TimeBank {
    return this.actor.getFlag("thefehrs-learning-manager", "bank") || { total: 0 };
  }

  // When options.render === false, we use DocumentUtils.setFlagsSilently to bypass
  // Foundry's normal document rendering cycle. This is useful for batch updates
  // or to avoid unnecessary UI flicker. The method still returns the actor.
  async setBank(bank: TimeBank, options: { render?: boolean } = {}): Promise<Actor> {
    if (options.render === false) {
      const success = await DocumentUtils.setFlagsSilently(this.actor, { bank });
      if (!success) {
        throw new Error("Downtime Engine | Failed to set bank silently");
      }
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

  get currency(): { cp: number; sp: number; ep: number; gp: number; pp: number } {
    const currency = (this.actor as LearningActor).system?.currency;
    return {
      cp: currency?.cp ?? 0,
      sp: currency?.sp ?? 0,
      ep: currency?.ep ?? 0,
      gp: currency?.gp ?? 0,
      pp: currency?.pp ?? 0,
    };
  }

  async updateCurrency(
    currency: { cp: number; sp: number; ep: number; gp: number; pp: number },
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
