<script lang="ts">
  import type {TimeUnit} from "@/types.js";

  let {
    autoSpend = $bindable(false),
    autoSpendUnits = $bindable([]),
    timeUnits = [],
  } = $props<{
    autoSpend: boolean;
    autoSpendUnits: string[];
    timeUnits: TimeUnit[];
  }>();

  function toggleUnit(id: string) {
    autoSpendUnits = autoSpendUnits.includes(id) ? autoSpendUnits.filter((u) => u !== id) : [...(autoSpendUnits), id];
  }
</script>

<section class="user-preferences">
  <header>
    <i class="fas fa-user-cog"></i>
    <h3>User Preferences</h3>
  </header>

  <div class="form-group">
    <label for="auto-spend">Auto-spend granted time</label>
    <div class="form-fields">
      <input id="auto-spend" type="checkbox" bind:checked={autoSpend} />
      <p class="notes">
        If enabled, granted time will be automatically spent on your active project.
      </p>
    </div>
  </div>

  {#if autoSpend}
    <div class="form-group">
      <span class="form-label">Allowed Units</span>
      <div class="form-fields">
        <div class="checkbox-group">
          {#each timeUnits as unit}
            <label class="checkbox-label">
              <input
                type="checkbox"
                data-unit-id={unit.id}
                checked={autoSpendUnits.includes(unit.id)}
                onchange={() => toggleUnit(unit.id)}
              />
              {unit.name} ({unit.short})
            </label>
          {:else}
            <p class="notes">No time units available.</p>
          {/each}
        </div>
        <p class="notes">Select which time units should be automatically spent.</p>
      </div>
    </div>
  {/if}
</section>

<style lang="scss">
  .user-preferences {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border-bottom: 1px solid var(--t5e-faint-color);
      padding-bottom: 0.25rem;
      margin-bottom: 0.5rem;

      i {
        color: var(--t5e-secondary-color);
      }

      h3 {
        margin: 0;
        font-size: 1.1rem;
      }
    }
  }

  .form-group {
    display: flex;
    gap: 1rem;

    label,
    .form-label {
      flex: 0 0 180px;
      font-weight: bold;
    }

    .form-fields {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
  }

  .checkbox-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;

    &.disabled {
      opacity: 0.5;
    }
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: normal;
    cursor: pointer;
    background: var(--t5e-faint-color);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    border: 1px solid transparent;

    &.disabled {
      cursor: not-allowed;
    }

    &:hover:not(.disabled) {
      background: var(--t5e-tertiary-color);
    }

    input {
      margin: 0;
    }
  }

  .notes {
    font-size: 0.8rem;
    color: var(--t5e-secondary-color);
    font-style: italic;
    margin: 0;
  }
</style>
