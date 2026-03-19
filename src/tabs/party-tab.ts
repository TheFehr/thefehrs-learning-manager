import { Settings } from "../settings";
import { ActorProxy } from "../actor-proxy";
import { TabLogic } from "./tab-logic";
import type { DowntimeGroupActor, TimeUnit } from "../types";

export class PartyTab {
  static async getData(partyActor: DowntimeGroupActor) {
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
    const library = Settings.projectTemplates;

    const projects = proxy.projects
      .map((p: any) => {
        const tier = Settings.guidanceTiers.find((t) => t.id === p.guidanceTierId);
        const tpl = library.find((t) => t.id === p.templateId);
        if (!tpl) return null;

        return {
          ...p,
          name: tpl.name,
          maxProgress: tpl.target,
          guidanceType: tier ? tier.name : "None",
          progressPercentage:
            tpl.target > 0 ? Math.min(100, Math.round((p.progress / tpl.target) * 100)) : 0,
          canAbort: p.progress === 0 || game.user?.isGM,
        };
      })
      .filter((p: any) => p !== null);

    return {
      id: proxy.id,
      name: proxy.name,
      img: proxy.img,
      tokenImg: proxy.tokenImg,
      currency: proxy.currency,
      formattedBank: TabLogic.formatTimeBank(bank.total, timeUnits),
      projects: projects.filter((p: any) => !p.isCompleted),
    };
  }

  private static getMemberId(member: any): string | null {
    if (member.ids instanceof Set) return (Array.from(member.ids)[0] as string) || null;
    return member.actorId || member.id || null;
  }
}
