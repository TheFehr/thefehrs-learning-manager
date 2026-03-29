import { ActorProxy } from "../actor-proxy.js";

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
    let actor = game.user?.character;

    // Fallback to selected token
    if (!actor && (canvas as any)?.tokens?.controlled?.length > 0) {
      actor = (canvas as any).tokens.controlled[0].actor;
    }

    if (!actor) {
      console.warn("Downtime Engine | No character controlled or token selected.");
      return;
    }

    const proxy = ActorProxy.forActor(actor as unknown as Actor);
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
    let actor = game.user?.character;
    if (!actor && (canvas as any)?.tokens?.controlled?.length > 0) {
      actor = (canvas as any).tokens.controlled[0].actor;
    }

    if (!actor) {
      console.warn("Downtime Engine | No character controlled or token selected.");
      return;
    }

    const proxy = ActorProxy.forActor(actor as unknown as Actor);
    const current = proxy.currency;
    await proxy.updateCurrency({
      ...current,
      gp: current.gp + gp,
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
    (window as any).ude = DebugHelpers;
    console.debug(
      "Downtime Engine | Debug helpers initialized. Use `ude.addTime(hours)` in the console.",
    );
  }
}
