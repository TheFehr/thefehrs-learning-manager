import type { TimeUnit } from "../types.js";

/**
 * Logic for the Grant Time Dialog component.
 */
export class GrantTimeLogic {
  /**
   * Transforms the array of time values into a record for submission.
   */
  static prepareSubmitData(timeValuesArray: { id: string; value: number }[]) {
    const values: Record<string, number> = {};
    for (const timeEntry of timeValuesArray) {
      values[timeEntry.id] = Number(timeEntry.value) || 0;
    }
    return values;
  }

  /**
   * Toggles an actor ID in the list of selected recipients.
   */
  static toggleRecipient(id: string, selectedIds: string[]): string[] {
    if (selectedIds.includes(id)) {
      return selectedIds.filter((memberId) => memberId !== id);
    } else {
      return [...selectedIds, id];
    }
  }
}
