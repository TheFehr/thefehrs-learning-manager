<script lang="ts">
  let { itemName, actorName, target }: { itemName: string, actorName: string, target: number } = $props();

  let progress = $state(0);
  let markComplete = $state(false);

  export function getValues(): { progress: number, markComplete: boolean } {
    const clamped = Math.max(0, Math.min(progress, target));
    return { progress: markComplete ? target : clamped, markComplete };
  }
</script>

<div class="thefehrs-initiate-dialog">
  <p>
    Add <strong>{itemName}</strong> to <strong>{actorName}</strong>'s downtime projects.
  </p>

  <div class="form-group">
    <label for="initiate-progress">Starting progress</label>
    <div class="progress-row">
      <input
        id="initiate-progress"
        class="initiate-progress-input"
        type="number"
        min="0"
        max={target}
        bind:value={progress}
        disabled={markComplete}
      />
      <span class="target-label">/ {target}</span>
    </div>
  </div>

  <label class="complete-toggle">
    <input type="checkbox" class="initiate-mark-complete" bind:checked={markComplete} />
    Mark as already complete
  </label>
</div>

<style lang="scss">
  .thefehrs-initiate-dialog {
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    p {
      margin: 0 0 0.25rem 0;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;

      label {
        font-weight: bold;
        font-size: 0.85rem;
      }
    }

    .progress-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      input[type="number"] {
        width: 5rem;
      }
    }

    .complete-toggle {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      cursor: pointer;
    }
  }
</style>
