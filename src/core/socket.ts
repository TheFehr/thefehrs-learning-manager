import { Settings } from "./settings.js";
import { Logger } from "./logger.js";
import type { LearningModuleMessage } from "./socket-types.js";
import { getSocket } from "./foundry.js";

export class Socket {
  static get identifier() {
    return `module.${Settings.ID}`;
  }

  /**
   * Type guard for LearningModuleMessage.
   */
  static isLearningModuleMessage(msg: unknown): msg is LearningModuleMessage {
    if (!msg || typeof msg !== "object") return false;
    const m = msg as Record<string, unknown>;
    return typeof m.type === "string" && "data" in m;
  }
  /**
   * Listens for signals from other clients.
   * Note: The emitting client does NOT receive its own broadcast.
   * @returns The handler function that was registered, or undefined if game.socket is unavailable.
   */
  static listen(
    handler: (msg: LearningModuleMessage) => Promise<void>,
  ): ((...args: any[]) => void) | undefined {
    const socket = getSocket();
    if (!socket) {
      Logger.warn("Socket: game.socket is not available.");
      return undefined;
    }

    const id = this.identifier;
    Logger.debug(`Socket: Listening on "${id}"`);

    const wrapper = (...args: any[]) => {
      const message = args[0];
      const isValid = this.isLearningModuleMessage(message);
      const summary = {
        type: isValid ? message.type : (message as any)?.type || "unknown",
        valid: isValid,
        argsCount: args.length,
      };

      if (!isValid) {
        Logger.warn("Socket: Received invalid message payload.", true, summary);
        return;
      }

      Logger.debug(`Socket: Received message on "${id}":`, summary);

      handler(message).catch((err) => {
        Logger.error("Socket: Error in handler:", err);
      });
    };

    socket.on(id, wrapper);
    return wrapper;
  }

  /**
   * Unregisters a previously registered listener.
   */
  static off(handler: (...args: any[]) => void) {
    const socket = getSocket();
    if (!socket) return;
    socket.off(this.identifier, handler);
  }

  /**
   * Emits a signal to all other connected clients.
   * Note: This will not trigger the local listener.
   */
  static emitSignal(type: LearningModuleMessage["type"]) {
    const socket = getSocket();
    if (!socket) {
      Logger.warn("Socket: game.socket is not available.");
      return;
    }

    const id = this.identifier;
    const message: LearningModuleMessage = { type, data: null };

    Logger.debug(`Socket: Emitting signal "${type}" to "${id}"`, message);

    socket.emit(id, message);
  }
}
