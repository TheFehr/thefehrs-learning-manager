import type { FoundrySocket } from "@/types.js";

/**
 * Safely get the global 'game' instance.
 * @throws Error if game is not initialized.
 */
export function getGame(): Game {
  const g = (globalThis as any).game as Game | undefined;
  if (!g) {
    throw new Error("Foundry VTT game is not initialized yet.");
  }
  return g;
}

/**
 * Safely get the global 'canvas' instance.
 * @throws Error if canvas is not initialized.
 */
export function getCanvas(): Canvas {
  const c = (globalThis as any).canvas as Canvas | undefined;
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
  return (globalThis as any).ui;
}

/**
 * Safely get the global 'socket' instance.
 * Returns null if no socket is available (e.g. in some specialized environments).
 */
export function getSocket(): FoundrySocket | null {
  return (globalThis as any).game?.socket ?? null;
}
