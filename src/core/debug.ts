import { ActorProxy } from "../actor-proxy.js";
import { Actor5e } from "../types";

function resolveControlledActor(): Actor | undefined {
  if (typeof canvas === "undefined" || !canvas?.ready) return undefined;

  let actor = game.user?.character;

  // Fallback to selected token
  const controlledTokens = (canvas as any).tokens?.controlled;
  if (!actor && controlledTokens && controlledTokens.length > 0) {
    actor = controlledTokens[0].actor ?? undefined;
  }

  return actor;
}

/**
 * Global helpers for debugging and "cheating" during development.
 * Available as `ude` in the browser console.
 */
export const DebugHelpers = {
  /**
   * Add a specific amount of training hours to the currently controlled character.
   * @param hours - The amount of hours to add. Supports negative values.
   */
  async addTime(hours: number) {
    const validatedHours = Number(hours);
    if (!Number.isFinite(validatedHours)) {
      const msg = `Invalid hours: ${hours}. Must be a finite number.`;
      console.warn(`Downtime Engine | ${msg}`);
      ui.notifications?.warn(`Downtime Engine | ${msg}`);
      return;
    }

    const actor = resolveControlledActor();

    if (!actor) {
      console.warn("Downtime Engine | No character controlled or token selected.");
      return;
    }

    const proxy = ActorProxy.forActor(actor as unknown as Actor5e);
    const bank = proxy.bank;
    const newTotal = Math.max(0, (bank.total || 0) + validatedHours);
    const diff = newTotal - (bank.total || 0);

    if (diff === 0 && validatedHours !== 0) {
      ui.notifications?.warn(`Downtime Engine | Bank already empty, cannot remove more time.`);
      return;
    }

    await proxy.setBank({ total: newTotal });
    const action = diff >= 0 ? "Added" : "Removed";
    const absDiff = Math.abs(diff);

    ui.notifications?.info(
      `Downtime Engine | ${action} ${absDiff}h to ${actor.name}'s bank. New total: ${newTotal}h`,
    );
    console.log(`Downtime Engine | Cheat: ${action} ${absDiff}h to ${actor.name}'s bank.`, {
      previous: bank.total,
      change: validatedHours,
      actualDiff: diff,
      newTotal,
    });
  },

  /**
   * Add a specific amount of gold to the currently controlled character.
   * @param gp - The amount of GP to add. Supports negative values.
   */
  async addGP(gp: number) {
    const validatedGP = Number(gp);
    if (!Number.isFinite(validatedGP)) {
      const msg = `Invalid gp: ${gp}. Must be a finite number.`;
      console.warn(`Downtime Engine | ${msg}`);
      ui.notifications?.warn(`Downtime Engine | ${msg}`);
      return;
    }

    const actor = resolveControlledActor();

    if (!actor) {
      console.warn("Downtime Engine | No character controlled or token selected.");
      return;
    }

    const proxy = ActorProxy.forActor(actor as unknown as Actor5e);
    const current = proxy.currency;
    const newGP = Math.max(0, (current.gp || 0) + validatedGP);
    const diff = newGP - (current.gp || 0);

    if (diff === 0 && validatedGP !== 0) {
      ui.notifications?.warn(`Downtime Engine | No GP available to remove.`);
      return;
    }

    const action = diff >= 0 ? "Added" : "Removed";
    const absDiff = Math.abs(diff);

    await proxy.updateCurrency({
      ...current,
      gp: newGP,
    });

    ui.notifications?.info(
      `Downtime Engine | ${action} ${absDiff}gp to ${actor.name}. New total: ${newGP}gp`,
    );
    console.log(`Downtime Engine | Cheat: ${action} ${absDiff}gp to ${actor.name}.`, {
      previous: current.gp,
      change: validatedGP,
      actualDiff: diff,
      newTotal: newGP,
    });
  },
};

/**
 * Initialize debug helpers on the window object if in development mode.
 */
export function initDebugHelpers() {
  // ude = User Downtime Engine - short and easy to type in console
  // We use ude to avoid naming collisions with common global variables
  // and to make it discoverable
  if (import.meta.env.DEV) {
    (window as unknown as { ude: typeof DebugHelpers }).ude = DebugHelpers;
    Hooks.once("ready", () => {
      console.debug(
        "Downtime Engine | Debug helpers initialized. Use `ude.addTime(hours)` in the console.",
      );
    });
  }
}
