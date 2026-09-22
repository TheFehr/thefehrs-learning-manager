/**
 * Blocks a second, independent "Complete Project" flow from starting on the
 * same project while one is already in flight.
 *
 * ProjectLifecycle.completeProject's own isLearningProject guard happens
 * before its first await, so two overlapping calls can both pass it and
 * each create a completed reward item before either deletes the original.
 * Confirmed live via GitHub review: a naive component-local guard isn't
 * enough on its own - PartyTabLogic.completeProject's own
 * updateItemWithProgress(..., true) call forces a re-render of the parent
 * sheet partway through, and LearningManager.renderSvelte unmounts and
 * remounts the Party tab's Svelte component on every render (see
 * PartyTabPending's own comment for the same underlying fact), wiping any
 * component $state clean mid-flight. Living at module scope instead, and
 * being acquired/released entirely inside the static orchestration method
 * (not tied to any component instance), survives that remount.
 */
const completing = new Set<string>();

function key(actorUuid: string, itemId: string): string {
  return `${actorUuid}:${itemId}`;
}

export const PartyTabCompletionLock = {
  /** Test-only: this set is a module-level singleton, so tests must reset it between runs. */
  clear() {
    completing.clear();
  },

  /** Attempts to acquire the lock for a project; returns false if already held. */
  tryAcquire(actorUuid: string, itemId: string): boolean {
    const k = key(actorUuid, itemId);
    if (completing.has(k)) return false;
    completing.add(k);
    return true;
  },

  release(actorUuid: string, itemId: string) {
    completing.delete(key(actorUuid, itemId));
  },
};
