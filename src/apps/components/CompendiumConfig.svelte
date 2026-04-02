<script lang="ts">
  let { 
    allowedCompendiums = $bindable([]), 
    availablePacks = [] 
  } = $props<{
    allowedCompendiums: string[];
    availablePacks: { id: string; label: string }[];
  }>();

  function toggleCompendium(id: string) {
    if (allowedCompendiums.includes(id)) {
      allowedCompendiums = allowedCompendiums.filter(c => c !== id);
    } else {
      allowedCompendiums = [...allowedCompendiums, id];
    }
  }
</script>

<section>
  <h3>Allowed Compendiums</h3>
  <p class="notes">Items dropped from these compendiums can start projects.</p>
  <div class="compendium-list">
    {#each availablePacks as pack (pack.id)}
      <label class="compendium-item">
        <input type="checkbox" checked={allowedCompendiums.includes(pack.id)} onchange={() => toggleCompendium(pack.id)} />
        <span>{pack.label} <small>[{pack.id}]</small></span>
      </label>
    {/each}
  </div>
</section>

<style lang="scss">
  .notes {
    font-size: 0.8rem;
    color: var(--t5e-secondary-color);
    font-style: italic;
    margin-bottom: 0.5rem;
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

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        opacity: 0.6;
      }
    }
  }
</style>
