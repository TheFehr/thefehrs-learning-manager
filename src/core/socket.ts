import { Settings } from "./settings.js";
import type { LearningModuleMessage } from "./socket-types.js";

export class Socket {
  static get identifier() {
    return `module.${Settings.ID}`;
  }

  /**
   * Listens for signals from other clients.
   * Note: The emitting client does NOT receive its own broadcast.
   */
  static listen(handler: (msg: LearningModuleMessage) => Promise<void>) {
    if (!game.socket) {
      console.warn("Downtime Engine | Socket: game.socket is not available.");
      return;
    }

    const id = this.identifier;
    console.info(`Downtime Engine | Socket: Listening on "${id}"`);

    game.socket.on(id, (...args: any[]) => {
      console.info(`Downtime Engine | Socket: Received data on "${id}":`, args);

      const message = args[0] as LearningModuleMessage;
      if (!message || typeof message.type !== "string") {
        console.warn("Downtime Engine | Socket: Received malformed message:", args);
        return;
      }

      handler(message).catch((err) => {
        console.error("Downtime Engine | Socket: Error in handler:", err);
      });
    });
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

    console.info(`Downtime Engine | Socket: Emitting signal "${type}" to "${id}"`, message);

    game.socket.emit(id, message);
  }
}
