<script lang="ts">
  import { Settings } from "../settings";

  let { item } = $props<{ item: any }>();

  // Use a derived state for the target to ensure it updates when the item updates
  let targetValue = $state(0);

  // Initialize from item flags
  $effect(() => {
    const flags = item.getFlag(Settings.ID, "projectData") || {};
    targetValue = flags.target ?? 0;
  });

  async function saveTarget() {
    await item.setFlag(Settings.ID, "projectData.target", targetValue);
    ui.notifications?.info(`Target progress updated for ${item.name}`);
  }
</script>

<div class="thefehrs-item-target-config">
  <header>
    <h3>Downtime Engine: Learning Configuration</h3>
    <p class="notes">Set the total progress units required to learn this item.</p>
  </header>

  <div class="form-group">
    <label for="target-progress">Target Progress (Base Units)</label>
    <div class="form-fields">
      <input
        id="target-progress"
        type="number"
        bind:value={targetValue}
        min="0"
        placeholder="e.g. 10"
      />
    </div>
  </div>

  <button type="button" onclick={saveTarget}>
    <i class="fas fa-save"></i> Save Configuration
  </button>
</div>

<style lang="scss">
  .thefehrs-item-target-config {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;

    h3 {
      border-bottom: 1px solid var(--t5e-faint-color);
      padding-bottom: 0.5rem;
      margin-top: 0;
    }

    .notes {
      font-size: 0.85rem;
      color: var(--t5e-secondary-color);
      margin-bottom: 1rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      label {
        font-weight: bold;
      }

      input {
        width: 100%;
      }
    }

    button {
      align-self: flex-start;
      padding: 0.5rem 1rem;
      background: var(--t5e-primary-accent-color);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        filter: brightness(1.1);
      }
    }
  }
</style>
