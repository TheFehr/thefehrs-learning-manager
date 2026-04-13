/**
 * A central helper for Foundry VTT utility functions.
 * This makes future major upgrades easier by providing a single point of change
 * if Foundry API changes.
 */
export class FoundryUtils {
  /**
   * Escapes HTML characters in a string.
   */
  static escapeHTML(str: string): string {
    return foundry.utils.escapeHTML(str);
  }

  /**
   * Deeply clones an object.
   */
  static deepClone<T>(obj: T): T {
    return foundry.utils.deepClone(obj);
  }

  /**
   * Merges two objects.
   */
  static mergeObject(original: object, other: object, options?: any): any {
    return foundry.utils.mergeObject(original, other, options);
  }

  /**
   * Gets a property from an object using a dot-notated path.
   */
  static getProperty(obj: object, path: string): any {
    return foundry.utils.getProperty(obj, path);
  }

  /**
   * Generates a random ID.
   */
  static randomID(): string {
    return foundry.utils.randomID();
  }

  /**
   * Checks if a version string is newer than another.
   */
  static isNewerVersion(newer: string, current: string): boolean {
    return foundry.utils.isNewerVersion(newer, current);
  }
}
