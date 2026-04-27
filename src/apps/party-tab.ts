import { Settings } from "@/core/settings.js";
import { ActorProxy } from "@/logic/actor-proxy.js";
import { TabLogic } from "@/logic/tab-logic.js";
import {
  isActor5e,
  type DowntimeGroupActor,
  type TimeUnit,
  type Item5e,
  type ProjectFlagData,
} from "@/types.js";
import type { PartyMemberData } from "@dnd5e/data/actor/_types.mjs";
import { MODULE_ID } from "@/global.js";
import { getGame } from "@/core/foundry.js";

export type ProjectMappedData = ProjectFlagData & {
  id: string;
  name: string;
  maxProgress: number;
  guidanceType: string;
  isSelfStudy: boolean;
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
        isGM: !!getGame().user?.isGM,
      };
    }
    const rawMembers = (partyActor.system.members || []) as PartyMemberData[];
    const timeUnits = Settings.get("timeUnits");

    return {
      members: rawMembers
        .map((m) => this.mapMemberData(m, timeUnits))
        .filter((m): m is MemberMappedData => !!m),
      isGM: !!getGame().user?.isGM,
    };
  }

  private static mapMemberData(
    member: PartyMemberData,
    timeUnits: TimeUnit[],
  ): MemberMappedData | null {
    const memberId = this.getMemberId(member);
    const actualActor = member.actor || (memberId ? getGame().actors?.get(memberId) : null);

    if (!isActor5e(actualActor)) return null;
    const proxy = ActorProxy.forActor(actualActor);

    const bank = proxy.bank;

    const itemProjects = (actualActor.items as unknown as Item5e[])
      .filter(
        (i) => i.getFlag(MODULE_ID, "isLearningProject") || i.getFlag(MODULE_ID, "isLearnedReward"),
      )
      .map((i): ProjectMappedData | null => {
        const projectData = i.getFlag(MODULE_ID, "projectData");
        if (!projectData) return null;

        const isLearnedReward = i.getFlag(MODULE_ID, "isLearnedReward");

        return {
          ...projectData,
          id: i.id!,
          name: i.name!,
          maxProgress: projectData.target || 0,
          guidanceType: projectData.lastInstructorName || "Self-Study",
          isSelfStudy: !projectData.lastInstructorName,
          progressPercentage:
            projectData.target && projectData.target > 0
              ? Math.min(100, Math.round(((projectData.progress || 0) / projectData.target) * 100))
              : 0,
          canAbort:
            ((projectData.progress || 0) === 0 && !isLearnedReward) || !!getGame().user?.isGM,
          isItemBased: true,
        };
      })
      .filter((p): p is ProjectMappedData => p !== null);

    return {
      id: proxy.id,
      name: proxy.name,
      img: proxy.img,
      tokenImg: proxy.tokenImg,
      currency: proxy.currency,
      formattedBank: TabLogic.formatTimeBank(bank.total, timeUnits),
      projects: itemProjects.filter((p) => !p.isCompleted),
    };
  }

  private static getMemberId(member: PartyMemberData): string | null {
    const m = member as unknown as { ids?: Set<string>; actorId?: string; id?: string };
    if (m.ids instanceof Set) return Array.from(m.ids)[0] || null;
    return m.actorId || m.id || null;
  }
}
