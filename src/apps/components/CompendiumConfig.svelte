<script lang="ts">
import type { PackInfo } from "@/logic/settings-logic.js";

  let { 
    allowedCompendiums = $bindable([]), 
    availablePacks = [],
    notes = "Items dropped from these compendiums can start projects."
  } = $props<{
    allowedCompendiums: string[];
    availablePacks: PackInfo[];
    notes?: string;
  }>();

  // Sort packs so that:
  // 1. Fitting packs first (contains relevant items)
  // 2. Selected packs next
  // 3. Alphabetical
  let displayedPacks = $derived(
    [...availablePacks].sort((a, b) => {
      // Fitting first
      if (a.isFitting !== b.isFitting) return a.isFitting ? -1 : 1;
      
      // Selected next
      const aSelected = allowedCompendiums.includes(a.id);
      const bSelected = allowedCompendiums.includes(b.id);
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      
      // Alphabetical
      return a.label.localeCompare(b.label);
    })
  );

  function toggleCompendium(id: string) {
    if (allowedCompendiums.includes(id)) {
      allowedCompendiums = allowedCompendiums.filter(c => c !== id);
    } else {
      allowedCompendiums = [...allowedCompendiums, id];
    }
  }
</script>

<section>
  <div class="compendium-header">
    <p class="notes">{notes}</p>
  </div>
  <div class="compendium-list">
    {#each displayedPacks as pack (pack.id)}
      <label class="compendium-item" class:is-fitting={pack.isFitting}>
        <input 
          type="checkbox" 
          data-pack-id={pack.id}
          checked={allowedCompendiums.includes(pack.id)} 
          onchange={() => toggleCompendium(pack.id)} 
        />
        <span>
          {pack.label} 
          {#if pack.isFitting}
            <i class="fas fa-star" title="Contains relevant items" aria-hidden="true"></i>
          {/if}
          <small>[{pack.id}]</small>
        </span>
      </label>
    {:else}
      <div class="empty-state">
        No compendiums available.
      </div>
    {/each}
  </div>
</section>

<style lang="scss">
    .empty-state {
    grid-column: span 2;
    text-align: center;
    padding: 1rem;
    opacity: 0.6;
    font-style: italic;
  }

  .compendium-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;

    .notes {
      margin-bottom: 0;
    }
  }

  .compendium-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    max-height: 150px;
    overflow-y: auto;
    border: 1px solid var(--t5e-faint-color);
    padding: 0.5rem;
    border-radius: 4px;

    .compendium-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;

      &.is-fitting {
        font-weight: bold;
      }

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }

      i {
        font-size: 0.7rem;
        color: var(--t5e-primary-color);
        margin-left: 0.2rem;
      }

      small {
        opacity: 0.6;
        margin-left: 0.2rem;
      }
    }
  }
</style>
