import { Settings } from "./settings.js";
import { LearningModuleMessage } from "./socket-types.js";

export class Socket {
  static get identifier() {
    return `module.${Settings.ID}`;
  }

  /**
   * Listens for signals from other clients.
   */
  static listen(handler: (msg: LearningModuleMessage) => Promise<void>) {
    game.socket?.on(this.identifier, async (message: LearningModuleMessage) => {
      await handler(message);
    });
  }

  /**
   * Emits a signal to all other connected clients.
   */
  static emitSignal(type: LearningModuleMessage["type"]) {
    game.socket?.emit(this.identifier, { type, data: null });
  }
}
