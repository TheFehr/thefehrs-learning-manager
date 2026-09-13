import type { FoundrySocket } from "@/types.js";

/**
 * Safely get the global 'game' instance.
 * @throws Error if game is not initialized.
 */
export function getGame(): Game {
  const g = (globalThis as unknown as { game: Game }).game;
  if (!g) {
    throw new Error("Foundry VTT game is not initialized yet.");
  }
  return g;
}

/**
 * Foundry v14 deprecated CONFIG.Dice.rollModes and the `rollMode` option of
 * Roll#toMessage in favor of CONFIG.ChatMessage.modes / `messageMode`
 * (removed entirely in v16). v13 only has the old API, so callers must
 * branch on the actual release rather than assume one shape.
 */
export function isV14RollModeApiAvailable(): boolean {
  return getGame().release.generation >= 14;
}

/**
 * Safely get the global 'canvas' instance.
 * @throws Error if canvas is not initialized.
 */
export function getCanvas(): Canvas {
  const c = (globalThis as unknown as { canvas: Canvas }).canvas;
  if (!c) {
    throw new Error("Foundry VTT canvas is not initialized yet.");
  }
  return c;
}

/**
 * Safely get the global 'ui' instance.
 * Returns undefined if ui is not initialized.
 */
export function getUI(): ({ notifications?: Notifications } & Record<string, any>) | undefined {
  return (
    globalThis as unknown as {
      ui: ({ notifications?: Notifications } & Record<string, any>) | undefined;
    }
  ).ui;
}

/**
 * Safely get the global 'socket' instance.
 * Returns null if no socket is available (e.g. in some specialized environments).
 */
export function getSocket(): FoundrySocket | null {
  return (
    (globalThis as unknown as { game?: { socket: FoundrySocket | null } }).game?.socket ?? null
  );
}
