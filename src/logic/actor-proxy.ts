import type { TimeBank, Actor5e, Item5e, LearningActor } from "@/types.js";
import type { ProjectFlagData } from "./project-item.js";
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
    return (this.actor as any).img ?? null;
  }

  get tokenImg(): string | null {
    return (this.actor as any).prototypeToken?.texture?.src ?? (this.actor as any).img ?? null;
  }

  get uuid(): string {
    return this.actor.uuid;
  }

  get projects() {
    return this.getMappedProjects().map((p: any) => ({
      ...p,
      guidanceType: p.tutelageName,
    }));
  }

  getMappedProjects() {
    return (this.actor.items as unknown as Item5e[])
      .filter((i: Item5e) => i.getFlag("thefehrs-learning-manager", "isLearningProject"))
      .map((i: Item5e) => {
        const projectData = i.getFlag("thefehrs-learning-manager", "projectData") as
          | ProjectFlagData
          | undefined;
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
  async setBank(bank: TimeBank, options: { render?: boolean } = {}): Promise<Actor5e> {
    if (options.render === false) {
      const success = await DocumentUtils.setFlagsSilently(this.actor, { bank });
      if (!success) {
        throw new Error("Downtime Engine | Failed to set bank silently");
      }
      return this.actor;
    }
    return (await (this.actor as any).setFlag(
      "thefehrs-learning-manager",
      "bank",
      bank,
    )) as Actor5e;
  }

  async update(data: object, options: { render?: boolean } = {}): Promise<Actor5e> {
    return (await (this.actor as any).update(data, options)) as Actor5e;
  }

  async createEmbeddedDocuments(type: "Item" | "ActiveEffect", data: object[]): Promise<any[]> {
    return (await (this.actor as any).createEmbeddedDocuments(type, data as any[])) || [];
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
  ): Promise<Actor5e> {
    return (await (this.actor as any).update(
      {
        system: {
          currency,
        },
      },
      options,
    )) as Actor5e;
  }

  static forActor(actor: Actor5e): ActorProxy {
    return new ActorProxy(actor);
  }
}
