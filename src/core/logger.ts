import { MODULE_ID } from "@/global.js";
import type { NotificationLevel, SystemRules } from "@/types.js";
import { getGame, getUI } from "./foundry.js";

const LEVELS: Record<NotificationLevel, number> = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

const LOG_PREFIX = "Downtime Engine | ";

/**
 * Helpers for filtered notifications and logging.
 */
export class LoggerSingleton {
  private get currentLevel(): number {
    try {
      const game = getGame();
      if (!game.settings) return LEVELS.info;
      const rules = game.settings.get(MODULE_ID, "rules") as SystemRules | undefined;
      const level = rules?.notificationLevel || "info";
      return LEVELS[level as NotificationLevel] ?? LEVELS.info;
    } catch {
      return LEVELS.info;
    }
  }

  /**
   * Send an info-level notification or log.
   * @param message - The message to display/log.
   * @param uiNotify - Whether to show a UI notification.
   * @param data - Optional related data.
   */
  info(message: string, uiNotify = false, ...data: any[]) {
    this._log("info", message, uiNotify, ...data);
  }

  /**
   * Send an error-level notification or log.
   * @param message - The error message.
   * @param uiNotify - Whether to show a UI notification.
   * @param data - Optional related error or data.
   */
  error(message: string, uiNotify = true, ...data: any[]) {
    this._log("error", message, uiNotify, ...data);
  }

  /**
   * Send a warning-level notification or log.
   * @param message - The warning message.
   * @param uiNotify - Whether to show a UI notification.
   * @param data - Optional related data.
   */
  warn(message: string, uiNotify = true, ...data: any[]) {
    this._log("warn", message, uiNotify, ...data);
  }

  /**
   * Send a debug-level log.
   * @param message - The debug message.
   * @param data - Optional related data.
   */
  debug(message: string, ...data: any[]) {
    this._log("debug", message, false, ...data);
  }

  /**
   * Internal helper to handle logging and notifications.
   */
  private _log(level: NotificationLevel, message: string, uiNotify: boolean, ...data: any[]) {
    if (this.currentLevel >= LEVELS[level]) {
      if (uiNotify) {
        try {
          const ui = getUI();
          if (ui?.notifications && level !== "none") {
            const notificationMethod = level as keyof Notifications;
            if (typeof ui.notifications[notificationMethod] === "function") {
              (ui.notifications[notificationMethod] as Function)(message);
            }
          }
        } catch (err) {
          console.error(`${LOG_PREFIX}Logger | UI notification failed:`, err);
        }
      }

      const consoleMethod = (level === "none" ? "log" : level) as keyof Console;
      if (data.length > 0) {
        (console[consoleMethod] as Function)(`${LOG_PREFIX}${message}`, ...data);
      } else {
        (console[consoleMethod] as Function)(`${LOG_PREFIX}${message}`);
      }
    }
  }
}

// Export a central singleton instance
export const Logger = new LoggerSingleton();
