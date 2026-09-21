/**
 * Tracks progress/target edits from the Party tab's GM manual-edit controls
 * that have been written to the backend but may not have been picked up by
 * a fresh read yet.
 *
 * PartyTabLogic's manual-edit writes are deliberately SILENT (no forced
 * re-render, to avoid flicker/scroll loss - see PartyTabLogic.updateProgress),
 * but LearningManager.renderSvelte unmounts and remounts the Party tab's
 * Svelte component fresh on every render of its parent sheet - it does not
 * do a props-only update. A component's own local optimistic state is
 * therefore not enough on its own: if some *other* re-render of the parent
 * sheet lands in the gap between the optimistic edit and the write actually
 * landing, the freshly-mounted component reads the item's still-stale flag
 * data with nothing left over to correct it afterward (confirmed live -
 * thefehrs-learning-manager#131 e2e coverage caught this).
 *
 * This map lives at module scope, outside any component's lifecycle,
 * specifically so it survives that remount. PartyTab.getData() (via
 * ActorProxy.getMappedProjects()'s callers in party-tab.ts) overlays it onto
 * every fresh read and clears an entry once that read confirms it.
 */
type PendingEntry = { progress?: number; target?: number };

const pending = new Map<string, PendingEntry>();

function key(actorUuid: string, itemId: string): string {
  return `${actorUuid}:${itemId}`;
}

/**
 * ProjectLifecycle.updateItemWithProgress (the backend write a manual edit
 * eventually performs) bakes progress into the item's own name, as
 * `${stashedName} (${progress}/${target})`. Both the Svelte component's
 * optimistic update and this module's own overlay need to reproduce that
 * same suffix on a name that may already carry the *old* one, so it's
 * shared here rather than duplicated - stripping and reapplying avoids
 * needing the item's stashed base name, which isn't exposed to either
 * caller (ActorProxy.getMappedProjects() doesn't include it).
 */
export function withProgressSuffix(name: string, progress: number, target: number): string {
  // Manual edits always submit integers, but progress can already be
  // fractional from the training path (ProjectEngine's progressGained is
  // ratio * a fractional multiplier, persisted with no rounding) - an
  // integer-only pattern here would fail to strip a name like "Feat
  // (4.5/10)", leaving a stray old suffix behind a new one.
  return `${name.replace(/\s*\(\d+(?:\.\d+)?\/\d+(?:\.\d+)?\)$/, "")} (${progress}/${target})`;
}

export const PartyTabPending = {
  /** Test-only: this map is a module-level singleton, so tests must reset it between runs. */
  clear() {
    pending.clear();
  },

  setProgress(actorUuid: string, itemId: string, progress: number) {
    const k = key(actorUuid, itemId);
    pending.set(k, { ...pending.get(k), progress });
  },

  setTarget(actorUuid: string, itemId: string, target: number) {
    const k = key(actorUuid, itemId);
    pending.set(k, { ...pending.get(k), target });
  },

  /**
   * Clears a pending edit that never landed (the write it was recorded
   * for failed) rather than leaving it to overlay every future read
   * indefinitely - resolve() only ever clears an entry once a fresh read
   * confirms it, which never happens for a write that's never going to
   * land.
   */
  clearProgress(actorUuid: string, itemId: string) {
    const k = key(actorUuid, itemId);
    const entry = pending.get(k);
    if (!entry) return;
    delete entry.progress;
    if (entry.progress === undefined && entry.target === undefined) pending.delete(k);
  },

  clearTarget(actorUuid: string, itemId: string) {
    const k = key(actorUuid, itemId);
    const entry = pending.get(k);
    if (!entry) return;
    delete entry.target;
    if (entry.progress === undefined && entry.target === undefined) pending.delete(k);
  },

  /**
   * Overlays any pending edit onto a freshly-read {progress, target, name}
   * triple, clearing whichever part of the entry the fresh read confirms.
   * name is only ever recomputed (via withProgressSuffix) when progress or
   * target actually got overridden, so an unaffected project's name passes
   * through untouched.
   */
  resolve(
    actorUuid: string,
    itemId: string,
    fresh: { progress: number; target: number; name: string },
  ): { progress: number; target: number; name: string } {
    const k = key(actorUuid, itemId);
    const entry = pending.get(k);
    if (!entry) return fresh;

    let { progress, target } = fresh;
    let overridden = false;

    if (entry.progress !== undefined) {
      if (entry.progress === fresh.progress) delete entry.progress;
      else {
        progress = entry.progress;
        overridden = true;
      }
    }
    if (entry.target !== undefined) {
      if (entry.target === fresh.target) delete entry.target;
      else {
        target = entry.target;
        overridden = true;
      }
    }

    if (entry.progress === undefined && entry.target === undefined) pending.delete(k);

    const name = overridden ? withProgressSuffix(fresh.name, progress, target) : fresh.name;
    return { progress, target, name };
  },
};
