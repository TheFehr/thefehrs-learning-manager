import { Logger } from "@/core/logger.js";

/**
 * Logic for the Grant Time Dialog component.
 */
export class GrantTimeLogic {
  /**
   * Transforms the array of time values into a record for submission.
   */
  static prepareSubmitData(timeValuesArray: { id: string; value: number | string }[]) {
    const values = new Map<string, number>();
    for (const timeEntry of timeValuesArray) {
      if (typeof timeEntry.id !== "string" || !timeEntry.id) {
        throw new Error(`Downtime Engine | Invalid or missing time unit ID: "${timeEntry.id}"`);
      }
      if (values.has(timeEntry.id)) {
        throw new Error(`Downtime Engine | Duplicate time unit ID: "${timeEntry.id}"`);
      }
      const val = Number(timeEntry.value);
      if (!Number.isFinite(val)) {
        throw new Error(
          `Downtime Engine | Invalid time value for "${timeEntry.id}": ${timeEntry.value}`,
        );
      }
      values.set(timeEntry.id, val);
    }
    return Object.fromEntries(values);
  }

  /**
   * Toggles an actor ID in the list of selected recipients.
   */
  static toggleRecipient(id: string, selectedIds: string[]): string[] {
    if (typeof id !== "string" || !id) {
      Logger.warn("Invalid recipient ID provided to toggleRecipient:", true, id);
      return [...selectedIds];
    }

    if (selectedIds.includes(id)) {
      return selectedIds.filter((memberId) => memberId !== id);
    } else {
      return [...selectedIds, id];
    }
  }
}
