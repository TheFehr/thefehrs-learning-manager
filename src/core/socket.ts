import { Settings } from "./settings.js";
import type { LearningModuleMessage } from "./socket-types.js";

export class Socket {
  static get identifier() {
    return `module.${Settings.ID}`;
  }

  /**
   * Type guard for LearningModuleMessage.
   */
  static isLearningModuleMessage(msg: any): msg is LearningModuleMessage {
    return (
      msg && typeof msg.type === "string" && (msg.data === null || typeof msg.data === "object")
    );
  }

  /**
   * Listens for signals from other clients.
   * Note: The emitting client does NOT receive its own broadcast.
   * @returns The handler function that was registered, or undefined if game.socket is unavailable.
   */
  static listen(
    handler: (msg: LearningModuleMessage) => Promise<void>,
  ): ((...args: any[]) => void) | undefined {
    if (!game.socket) {
      console.warn("Downtime Engine | Socket: game.socket is not available.");
      return undefined;
    }

    const id = this.identifier;
    console.debug(`Downtime Engine | Socket: Listening on "${id}"`);

    const wrapper = (...args: any[]) => {
      console.debug(`Downtime Engine | Socket: Received data on "${id}":`, args);

      const message = args[0];
      if (!this.isLearningModuleMessage(message)) {
        console.warn("Downtime Engine | Socket: Received invalid message payload:", args);
        return;
      }

      handler(message).catch((err) => {
        console.error("Downtime Engine | Socket: Error in handler:", err);
      });
    };

    game.socket.on(id, wrapper);
    return wrapper;
  }

  /**
   * Unregisters a previously registered listener.
   */
  static off(handler: (...args: any[]) => void) {
    if (!game.socket) return;
    game.socket.off(this.identifier, handler);
  }

  /**
   * Emits a signal to all other connected clients.
   * Note: This will not trigger the local listener.
   */
  static emitSignal(type: LearningModuleMessage["type"]) {
    if (!game.socket) {
      console.warn("Downtime Engine | Socket: game.socket is not available.");
      return;
    }

    const id = this.identifier;
    const message: LearningModuleMessage = { type, data: null };

    console.debug(`Downtime Engine | Socket: Emitting signal "${type}" to "${id}"`, message);

    game.socket.emit(id, message);
  }
}
