import { Settings } from "./core/settings.js";
import { ActorProxy } from "./actor-proxy.js";
import { TabLogic } from "./tab-logic.js";
import type { DowntimeGroupActor, TimeUnit, Actor5e, Item5e, ProjectFlagData } from "./types.js";
import type { PartyMemberData } from "@dnd5e/data/actor/_types.mjs";

export type ProjectMappedData = ProjectFlagData & {
  id: string;
  name: string;
  maxProgress: number;
  guidanceType: string;
  progressPercentage: number;
  canAbort: boolean;
  isItemBased: boolean;
};

export interface MemberMappedData {
  id: string;
  name: string;
  img: string | null;
  tokenImg: string | null;
  currency: { gp: number; sp: number; cp: number };
  formattedBank: string;
  projects: ProjectMappedData[];
}

export class PartyTab {
  static getData(partyActor: DowntimeGroupActor) {
    if (!partyActor?.system) {
      return {
        members: [],
        tierOptions: {},
        isGM: game.user?.isGM,
      };
    }
    const rawMembers = (partyActor.system.members || []) as PartyMemberData[];
    const timeUnits = Settings.timeUnits;
    const tiers = Settings.guidanceTiers;

    const tierOptions = tiers.reduce((acc: Record<string, string>, t) => {
      const sign = t.modifier > 0 ? "+" : "";
      acc[t.id] = `${t.name} (${sign}${t.modifier})`;
      return acc;
    }, {});

    return {
      members: rawMembers
        .map((m) => this.mapMemberData(m, timeUnits))
        .filter((m): m is MemberMappedData => !!m),
      tierOptions,
      isGM: game.user?.isGM,
    };
  }

  private static mapMemberData(
    member: PartyMemberData,
    timeUnits: TimeUnit[],
  ): MemberMappedData | null {
    const actualActor =
      member.actor ||
      (this.getMemberId(member) ? game.actors?.get(this.getMemberId(member)!) : null);

    if (!globalThis.Actor || !(actualActor instanceof globalThis.Actor)) return null;
    const a = actualActor as unknown as Actor5e;
    const proxy = ActorProxy.forActor(a as any);

    const bank = proxy.bank;

    const itemProjects = (a.items as unknown as Item5e[])
      .filter(
        (i) =>
          i.getFlag("thefehrs-learning-manager", "isLearningProject") ||
          i.getFlag("thefehrs-learning-manager", "isLearnedReward"),
      )
      .map((i): ProjectMappedData | null => {
        const projectData = i.getFlag("thefehrs-learning-manager", "projectData");
        if (!projectData) return null;

        const isLearnedReward = i.getFlag("thefehrs-learning-manager", "isLearnedReward");

        const tier = Settings.guidanceTiers.find((t) => t.id === projectData.tutelageId);

        return {
          ...projectData,
          id: i.id!,
          name: i.name!,
          maxProgress: projectData.target,
          guidanceType: tier ? tier.name : "None",
          progressPercentage:
            projectData.target > 0
              ? Math.min(100, Math.round((projectData.progress / projectData.target) * 100))
              : 0,
          canAbort: (projectData.progress === 0 && !isLearnedReward) || game.user?.isGM || false,
          isItemBased: true,
        };
      })
      .filter((p): p is ProjectMappedData => p !== null);

    const allProjects = [...itemProjects];

    return {
      id: proxy.id,
      name: proxy.name,
      img: proxy.img,
      tokenImg: proxy.tokenImg,
      currency: proxy.currency,
      formattedBank: TabLogic.formatTimeBank(bank.total, timeUnits),
      projects: allProjects.filter((p) => !p.isCompleted),
    };
  }

  private static getMemberId(member: PartyMemberData): string | null {
    const m = member as unknown as { ids?: Set<string>; actorId?: string; id?: string };
    if (m.ids instanceof Set) return Array.from(m.ids)[0] || null;
    return m.actorId || m.id || null;
  }
}
