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

  let showAll = $state(false);

  // If showAll is false, we filter availablePacks to only include:
  // 1. Fitting packs (have flags)
  // 2. Already selected packs
  let displayedPacks = $derived(
    showAll 
      ? availablePacks 
      : availablePacks.filter(p => p.isFitting || allowedCompendiums.includes(p.id))
  );
  
  // We have filtering if there are ANY non-fitting packs that are not selected
  let hasFiltering = $derived(
    availablePacks.some(p => !p.isFitting && !allowedCompendiums.includes(p.id))
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
    {#if hasFiltering}
      <label class="toggle-show-all">
        <input type="checkbox" bind:checked={showAll} />
        <span>Show all compendiums</span>
      </label>
    {/if}
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
            <i class="fas fa-star" title="Contains relevant items"></i>
          {/if}
          <small>[{pack.id}]</small>
        </span>
      </label>
    {:else}
      <div class="empty-state">
        {#if showAll}
          No compendiums available.
        {:else}
          No "fitting" compendiums found. 
          {#if hasFiltering}
            Try <button type="button" class="inline-link" onclick={() => { showAll = true; }}>showing all</button>.
          {/if}
        {/if}
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

    .inline-link {
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      color: var(--t5e-primary-color);
      text-decoration: underline;
      cursor: pointer;
      font-size: inherit;
      font-family: inherit;
      font-style: italic;

      &:hover {
        color: var(--t5e-secondary-color);
      }
    }
  }

  .compendium-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;

    .notes {
      margin-bottom: 0;
    }

    .toggle-show-all {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.75rem;
      cursor: pointer;
      opacity: 0.8;

      &:hover {
        opacity: 1;
      }
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
