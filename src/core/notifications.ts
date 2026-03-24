import { Settings } from "./settings.js";
import type { NotificationLevel } from "../types.js";

const LEVELS: Record<NotificationLevel, number> = {
  none: 0,
  error: 1,
  info: 2,
  debug: 3,
};

/**
 * Helpers for filtered notifications and logging.
 */
export class Logger {
  private static get currentLevel(): number {
    const level = Settings.rules.notificationLevel || "info";
    return LEVELS[level];
  }

  static info(message: string, uiOnly = false) {
    if (this.currentLevel >= LEVELS.info) {
      try {
        ui.notifications?.info(message);
      } catch (err) {
        console.error("Logger | UI notification failed:", err);
      }
    }
    if (!uiOnly) console.log(`Downtime Engine | ${message}`);
  }

  static error(message: string, err?: unknown) {
    if (this.currentLevel >= LEVELS.error) {
      try {
        ui.notifications?.error(message);
      } catch (uiErr) {
        console.error("Logger | UI notification failed:", uiErr);
      }
    }
    console.error(`Downtime Engine | ${message}`, err || "");
  }

  static warn(message: string) {
    if (this.currentLevel >= LEVELS.info) {
      try {
        ui.notifications?.warn(message);
      } catch (err) {
        console.error("Logger | UI notification failed:", err);
      }
    }
    console.warn(`Downtime Engine | ${message}`);
  }

  static debug(message: string, data?: unknown) {
    if (this.currentLevel >= LEVELS.debug) {
      console.debug(`Downtime Engine | ${message}`, data || "");
    }
  }
}
