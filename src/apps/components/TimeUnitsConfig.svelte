<script lang="ts">
  import type { TimeUnit } from "../../types";

  let { timeUnits = $bindable([]) }: { timeUnits: TimeUnit[] } = $props();

  function updateUnit(id: string, patch: Partial<TimeUnit>) {
    timeUnits = timeUnits.map((u) => (u.id === id ? { ...u, ...patch } : u));
  }

  function normalizeRatio(unit: TimeUnit) {
    const updatedRatio = Math.max(1, Math.floor(Number(unit.ratio) || 1));
    updateUnit(unit.id, { ratio: updatedRatio });
  }

  function addTimeUnit() {
    timeUnits = [
      ...timeUnits,
      {
        id: foundry.utils.randomID(),
        name: "New Unit",
        short: "u",
        isBulk: false,
        ratio: 1,
      },
    ];
  }

  function removeTimeUnit(id: string) {
    if (timeUnits.length <= 1) {
      ui.notifications?.warn("Downtime Engine | You must have at least one time unit defined.");
      return;
    }
    timeUnits = timeUnits.filter((u) => u.id !== id);
  }
</script>

<section>
  <h3>Time Units</h3>
  <table class="tidy-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Short</th>
        <th title="Bulk units use defined progress instead of 1">Bulk?</th>
        <th title="Ratio to base unit (e.g. Day = 10 Hours)">Ratio</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each timeUnits as unit (unit.id)}
        <tr>
          <td>
            <input
              type="text"
              value={unit.name}
              oninput={(e) => updateUnit(unit.id, { name: e.currentTarget.value })}
              aria-label="Unit Name"
            />
          </td>
          <td>
            <input
              type="text"
              value={unit.short}
              oninput={(e) => updateUnit(unit.id, { short: e.currentTarget.value })}
              style="width: 40px;"
              aria-label="Unit Short Name"
            />
          </td>
          <td style="text-align: center;">
            <input
              type="checkbox"
              checked={unit.isBulk}
              onchange={(e) => updateUnit(unit.id, { isBulk: e.currentTarget.checked })}
              aria-label="Is Bulk?"
            />
          </td>
          <td>
            <input
              type="number"
              value={unit.ratio}
              onchange={(e) => {
                updateUnit(unit.id, { ratio: Number(e.currentTarget.value) });
                normalizeRatio(unit);
              }}
              min="1"
              step="1"
              style="width: 60px;"
              aria-label="Ratio"
            />
          </td>
          <td>
            <button
              type="button"
              class="tidy-button small danger"
              onclick={() => removeTimeUnit(unit.id)}
              title="Delete Time Unit"
            >
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <button type="button" class="tidy-button" onclick={addTimeUnit}>
    <i class="fas fa-plus"></i> Add Unit
  </button>
</section>

<style lang="scss">
  .tidy-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.5rem;

    th, td {
      padding: 0.25rem;
      text-align: left;
    }

    input[type="text"], input[type="number"] {
      width: 100%;
    }
  }

  button.danger {
    color: var(--t5e-danger-color);

    &:hover {
      background: var(--t5e-danger-color);
      color: white;
    }
  }
</style>
