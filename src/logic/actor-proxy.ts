import type { TimeBank, Actor5e, Item5e, LearningActor, ActorSystem5e } from "@/types.js";
import { ProjectFlagData, ProjectMappedData } from "./project-item.js";
import { DocumentUtils } from "@/core/document-utils.js";
import { MODULE_ID } from "@/global.js";
import { FoundryUtils } from "@/core/foundry-utils.js";

/**
 * Internal interface to model the specific Foundry VTT Actor properties
 * required by the proxy, avoiding scattered 'any' casts.
 */
interface ProxyActorCore extends Omit<
  Actor5e,
  "update" | "items" | "createEmbeddedDocuments" | "system" | "prototypeToken"
> {
  uuid: string;
  img: string;
  prototypeToken?: { texture?: { src?: string } };
  items: {
    get(id: string): Item5e | undefined;
    filter(predicate: (i: Item5e) => boolean | unknown): Item5e[];
    map<T>(transform: (i: Item5e) => T): T[];
  };
  system: ActorSystem5e & {
    currency?: { cp: number; sp: number; ep: number; gp: number; pp: number };
  };
  update(data: Record<string, unknown>, options?: Record<string, unknown>): Promise<Actor5e>;
  createEmbeddedDocuments(type: string, data: Record<string, unknown>[]): Promise<any[]>;
  deleteEmbeddedDocuments(type: string, ids: string[]): Promise<any[]>;
}

export class ActorProxy {
  private actor: ProxyActorCore;

  constructor(actor: Actor5e) {
    this.actor = actor as unknown as ProxyActorCore;
  }

  get id(): string {
    return this.actor.id!;
  }

  get uuid(): string {
    return this.actor.uuid;
  }

  get name(): string {
    return this.actor.name || "Unknown";
  }

  get img(): string {
    return this.actor.img || "icons/svg/mystery-man.svg";
  }

  get tokenImg(): string {
    return this.actor.prototypeToken?.texture?.src || this.img;
  }

  get bank(): TimeBank {
    return (
      (this.actor.getFlag(MODULE_ID, "bank") as TimeBank) || {
        total: 0,
      }
    );
  }

  get currency(): { cp: number; sp: number; ep: number; gp: number; pp: number } {
    return this.actor.system.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  }

  get projects(): ProjectMappedData[] {
    return this.getMappedProjects();
  }

  getMappedProjects(): ProjectMappedData[] {
    return this.actor.items
      .filter(
        (i: Item5e) =>
          i.getFlag(MODULE_ID, "isLearningProject") || i.getFlag(MODULE_ID, "isLearnedReward"),
      )
      .map((i: Item5e) => {
        const projectData = (i.getFlag(MODULE_ID, "projectData") as ProjectFlagData) || {};
        const progress = projectData.progress || 0;
        const target = projectData.target || 0;
        const percentage = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0;
        const tutelageName = projectData.lastInstructorName || "Self-Study";

        return {
          id: i.id!,
          name: i.name!,
          progress,
          target,
          maxProgress: target,
          percentage,
          tutelageName,
          guidanceType: tutelageName,
          progressPercentage: projectData.progressPercentage ?? percentage,
          isSelfStudy: !projectData.lastInstructorName,
        };
      });
  }

  async setBank(bank: TimeBank, options: { render?: boolean } = {}): Promise<LearningActor> {
    if (options.render === false) {
      const success = await DocumentUtils.setFlagsSilently(this.actor, { bank });
      if (!success) {
        throw new Error("Failed to set bank silently");
      }
      return this.actor as unknown as LearningActor;
    }
    return (await this.actor.setFlag(MODULE_ID, "bank", bank)) as unknown as LearningActor;
  }

  async updateProject(
    itemId: string,
    projectData: Partial<ProjectFlagData>,
  ): Promise<Item5e | null> {
    const item = this.actor.items.get(itemId);
    if (!item) return null;

    const currentData = (item.getFlag(MODULE_ID, "projectData") as ProjectFlagData) || {};
    const updatedData = FoundryUtils.mergeObject(currentData, projectData);

    return (await item.setFlag(MODULE_ID, "projectData", updatedData)) as Item5e;
  }

  async updateCurrency(
    currency: { cp: number; sp: number; ep: number; gp: number; pp: number },
    options: { render?: boolean } = {},
  ): Promise<Actor5e> {
    const updateData = {
      system: {
        currency: {
          cp: Number(currency.cp || 0),
          sp: Number(currency.sp || 0),
          ep: Number(currency.ep || 0),
          gp: Number(currency.gp || 0),
          pp: Number(currency.pp || 0),
        },
      },
    };

    return await this.actor.update(updateData, options);
  }

  async createEmbeddedDocuments(type: string, data: Record<string, unknown>[]): Promise<any[]> {
    return await this.actor.createEmbeddedDocuments(type, data);
  }

  async deleteEmbeddedDocuments(type: string, ids: string[]): Promise<string[]> {
    return (await this.actor.deleteEmbeddedDocuments(type, ids)) as string[];
  }

  static forActor(actor: Actor5e): ActorProxy {
    return new ActorProxy(actor);
  }
}
