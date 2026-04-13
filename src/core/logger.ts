import { MODULE_ID } from "@/global.js";
import type { NotificationLevel } from "@/types.js";

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
      if (typeof game === "undefined" || !game.settings) return LEVELS.info;
      const rules = game.settings.get(MODULE_ID, "rules") as any;
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
    if (this.currentLevel >= LEVELS.info) {
      if (uiNotify) {
        try {
          ui.notifications?.info(message);
        } catch (err) {
          console.error(`${LOG_PREFIX}Logger | UI notification failed:`, err);
        }
      }
      if (data.length > 0) {
        console.info(`${LOG_PREFIX}${message}`, ...data);
      } else {
        console.info(`${LOG_PREFIX}${message}`);
      }
    }
  }

  /**
   * Send an error-level notification or log.
   * @param message - The error message.
   * @param err - Optional related error or data.
   * @param uiNotify - Whether to show a UI notification.
   */
  error(message: string, err?: unknown, uiNotify = true) {
    if (this.currentLevel >= LEVELS.error) {
      if (uiNotify) {
        try {
          ui.notifications?.error(message);
        } catch (uiErr) {
          console.error(`${LOG_PREFIX}Logger | UI notification failed:`, uiErr);
        }
      }
      if (err) {
        console.error(`${LOG_PREFIX}${message}`, err);
      } else {
        console.error(`${LOG_PREFIX}${message}`);
      }
    }
  }

  /**
   * Send a warning-level notification or log.
   * @param message - The warning message.
   * @param uiNotify - Whether to show a UI notification.
   * @param data - Optional related data.
   */
  warn(message: string, uiNotify = true, ...data: any[]) {
    if (this.currentLevel >= LEVELS.warn) {
      if (uiNotify) {
        try {
          ui.notifications?.warn(message);
        } catch (err) {
          console.error(`${LOG_PREFIX}Logger | UI notification failed:`, err);
        }
      }
      if (data.length > 0) {
        console.warn(`${LOG_PREFIX}${message}`, ...data);
      } else {
        console.warn(`${LOG_PREFIX}${message}`);
      }
    }
  }

  /**
   * Send a debug-level log.
   * @param message - The debug message.
   * @param data - Optional related data.
   */
  debug(message: string, ...data: any[]) {
    if (this.currentLevel >= LEVELS.debug) {
      if (data.length > 0) {
        console.debug(`${LOG_PREFIX}${message}`, ...data);
      } else {
        console.debug(`${LOG_PREFIX}${message}`);
      }
    }
  }
}

// Export a central singleton instance
export const Logger = new LoggerSingleton();
