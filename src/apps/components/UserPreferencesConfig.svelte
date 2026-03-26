<script lang="ts">
  import type { TimeUnit } from "../../types.js";

  let {
    autoSpend = $bindable(),
    autoSpendUnits = $bindable(),
    timeUnits = [],
  } = $props<{
    autoSpend: boolean;
    autoSpendUnits: string;
    timeUnits: TimeUnit[];
  }>();

  const getSelectedUnits = () =>
    autoSpendUnits ? autoSpendUnits.split(",").filter((u) => u.trim() !== "") : [];

  function toggleUnit(id: string) {
    const current = getSelectedUnits();
    const next = current.includes(id) ? current.filter((u) => u !== id) : [...current, id];
    autoSpendUnits = next.join(",");
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

  <div class="form-group">
    <span class="form-label">Allowed Units</span>
    <div class="form-fields">
      <div class="checkbox-group">
        {#each timeUnits as unit}
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={getSelectedUnits().includes(unit.id)}
              onchange={() => toggleUnit(unit.id)}
            />
            {unit.name} ({unit.short})
          </label>
        {/each}
      </div>
      <p class="notes">Select which time units should be automatically spent.</p>
    </div>
  </div>
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
    gap: 0.75rem;

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

      &:hover {
        background: var(--t5e-tertiary-color);
      }

      input {
        margin: 0;
      }
    }
  }

  .notes {
    font-size: 0.8rem;
    color: var(--t5e-secondary-color);
    font-style: italic;
    margin: 0;
  }
</style>
