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

  static activateListeners(html: HTMLElement, actor: Actor) {
    // Grant Time Dialog Listener
    const grantBtn = html.querySelector(".grant-time-btn");
    if (grantBtn) {
      grantBtn.addEventListener("click", async () => {
        if (!game.user?.isGM) return;

        const timeUnits = Settings.timeUnits;
        const isParty = (actor.type as string) === "group";

        const members = isParty
          ? (actor as DowntimeGroupActor).system.members
              .map((m) => this.mapMemberData(m, timeUnits))
              .filter((m) => !!m)
          : [];

        const templateData = { timeUnits, isParty, members };
        const content = await renderTemplate(
          `modules/thefehrs-learning-manager/templates/grant-time-dialog.hbs`,
          templateData,
        );

        new Dialog({
          title: "Distribute Training Time",
          content: content,
          buttons: {
            apply: {
              label: "Grant Time",
              icon: '<i class="fas fa-check"></i>',
              callback: async (dialogHtml: JQuery | HTMLElement) => {
                const htmlElement = dialogHtml instanceof HTMLElement ? dialogHtml : dialogHtml[0];
                const form = htmlElement.querySelector("form");
                if (!form) return;

                const formData = new FormData(form);

                let totalBase = 0;
                timeUnits.forEach((tu) => {
                  totalBase += (parseInt(formData.get(`time_${tu.id}`) as string) || 0) * tu.ratio;
                });

                if (totalBase === 0) return ui.notifications?.warn("No time entered.");

                const selectedIds = isParty
                  ? members.filter((m: any) => formData.has(`actor_${m.id}`)).map((m: any) => m.id)
                  : [actor.id];

                if (selectedIds.length === 0)
                  return ui.notifications?.warn("No recipients selected.");

                let successCount = 0;
                for (const id of selectedIds) {
                  const a = game.actors?.get(id) as Actor | undefined;
                  if (!globalThis.Actor || !(a instanceof globalThis.Actor)) continue;
                  try {
                    const proxy = ActorProxy.forActor(a);
                    const bank = proxy.bank;
                    await proxy.setBank({ total: (bank.total || 0) + totalBase });
                    successCount++;
                  } catch (err) {
                    console.error(`Failed to update bank for actor ${id}:`, err);
                  }
                }

                (ChatMessage.implementation as any).create({
                  speaker: { alias: "Downtime System" },
                  content: `Granted <strong>${TabLogic.formatTimeBank(totalBase, timeUnits)}</strong> to ${successCount} characters.`,
                });
              },
            },
          },
          default: "apply",
        }).render(true);
      });
    }

    TabLogic.activateListeners(html, actor);
  }

  private static getMemberId(member: any): string | null {
    if (member.ids instanceof Set) return (Array.from(member.ids)[0] as string) || null;
    return member.actorId || member.id || null;
  }
}
