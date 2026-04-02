import { ActorProxy } from "../actor-proxy.js";

function resolveControlledActor(): Actor | undefined {
  let actor = game.user?.character;

  // Fallback to selected token
  const controlledTokens = (canvas as { tokens?: { controlled?: { actor: Actor }[] } })?.tokens
    ?.controlled;
  if (!actor && controlledTokens && controlledTokens.length > 0) {
    actor = controlledTokens[0].actor;
  }
  return actor;
}

/**
 * Developer-only cheat helpers for the browser console.
 * Available via `window.ude` in development mode.
 */
export const DebugHelpers = {
  /**
   * Add a specific amount of hours to the currently controlled character's time bank.
   * Checks for game.user.character first, then falls back to the first selected token.
   * @param hours - The amount of hours to add.
   */
  async addTime(hours: number) {
    const actor = resolveControlledActor();

    if (!actor) {
      console.warn("Downtime Engine | No character controlled or token selected.");
      return;
    }

    const proxy = ActorProxy.forActor(actor);
    const bank = proxy.bank;
    const newTotal = (bank.total || 0) + hours;

    await proxy.setBank({ total: newTotal });
    ui.notifications?.info(
      `Downtime Engine | Added ${hours}h to ${actor.name}'s bank. New total: ${newTotal}h`,
    );
    console.log(`Downtime Engine | Cheat: Added ${hours}h to ${actor.name}'s bank.`, {
      previous: bank.total,
      added: hours,
      newTotal,
    });
  },

  /**
   * Add a specific amount of gold to the currently controlled character.
   * @param gp - The amount of GP to add.
   */
  async addGP(gp: number) {
    const actor = resolveControlledActor();

    if (!actor) {
      console.warn("Downtime Engine | No character controlled or token selected.");
      return;
    }

    const proxy = ActorProxy.forActor(actor);
    const current = proxy.currency;
    await proxy.updateCurrency({
      gp: (current.gp || 0) + gp,
      sp: current.sp || 0,
      cp: current.cp || 0,
    });
    ui.notifications?.info(`Downtime Engine | Added ${gp}gp to ${actor.name}.`);
  },
};

/**
 * Initialize debug helpers on the window object if in development mode.
 */
export function initDebugHelpers() {
  // @ts-expect-error - Vite specific environment variable
  if (import.meta.env.DEV) {
    (window as unknown as { ude: typeof DebugHelpers }).ude = DebugHelpers;
    console.debug(
      "Downtime Engine | Debug helpers initialized. Use `ude.addTime(hours)` in the console.",
    );
  }
}
