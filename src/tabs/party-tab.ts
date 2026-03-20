import { Settings } from "../settings";
import { ActorProxy } from "../data/actor-proxy";
import { TabLogic } from "./tab-logic";
import type { DowntimeGroupActor, TimeUnit, LearningProject } from "../types";

export class PartyTab {
  static getData(partyActor: DowntimeGroupActor) {
    if (!partyActor?.system) {
      return {
        members: [],
        tierOptions: {},
        isGM: game.user?.isGM,
      };
    }
    const rawMembers = partyActor.system.members || [];
    const timeUnits = Settings.timeUnits;
    const tiers = Settings.guidanceTiers;

    const tierOptions = tiers.reduce((acc: Record<string, string>, t) => {
      const sign = t.modifier > 0 ? "+" : "";
      acc[t.id] = `${t.name} (${sign}${t.modifier})`;
      return acc;
    }, {});

    return {
      members: rawMembers.map((m) => this.mapMemberData(m, timeUnits)).filter((m) => !!m),
      tierOptions,
      isGM: game.user?.isGM,
    };
  }

  private static mapMemberData(member: any, timeUnits: TimeUnit[]): any {
    const actorId = this.getMemberId(member);
    const actualActor = member.actor || (actorId ? game.actors?.get(actorId as string) : null);

    if (!globalThis.Actor || !(actualActor instanceof globalThis.Actor)) return null;
    const a = actualActor as Actor;
    const proxy = ActorProxy.forActor(a);

    const bank = proxy.bank;

    const itemProjects = (a.items as unknown as any[])
      .filter(
        (i) =>
          i.getFlag(Settings.ID, "isLearningProject") || i.getFlag(Settings.ID, "isLearnedReward"),
      )
      .map((i) => {
        const projectData = (i.getFlag(Settings.ID, "projectData") as any) || {};
        const isLearnedReward = i.getFlag(Settings.ID, "isLearnedReward");

        const tier = Settings.guidanceTiers.find((t) => t.id === projectData.guidanceTierId);

        return {
          ...projectData,
          id: i.id,
          name: i.name,
          maxProgress: projectData.target,
          guidanceType: tier ? tier.name : "None",
          progressPercentage:
            projectData.target > 0
              ? Math.min(100, Math.round((projectData.progress / projectData.target) * 100))
              : 0,
          canAbort: (projectData.progress === 0 && !isLearnedReward) || game.user?.isGM,
          isItemBased: true,
        };
      })
      .filter((p) => p !== null);

    const allProjects = [...itemProjects];

    return {
      id: proxy.id,
      name: proxy.name,
      img: proxy.img,
      tokenImg: proxy.tokenImg,
      currency: proxy.currency,
      formattedBank: TabLogic.formatTimeBank(bank.total, timeUnits),
      projects: allProjects.filter((p: any) => !p.isCompleted),
    };
  }

  private static getMemberId(member: any): string | null {
    if (member.ids instanceof Set) return (Array.from(member.ids)[0] as string) || null;
    return member.actorId || member.id || null;
  }
}
