<script lang="ts">
  let {
    tuName,
    bulkValue,
    chancePercent,
    separateValue,
    checkDC,
    isBulkRoll = false,
    isSeparateRoll = true,
    batchThreshold,
    ratio,
  }: {
    tuName: string;
    bulkValue: string | number;
    chancePercent: string | number;
    separateValue: string | number;
    checkDC: number;
    isBulkRoll?: boolean;
    isSeparateRoll?: boolean;
    batchThreshold: number;
    ratio: number;
  } = $props();
</script>

<div class="training-resolution">
  <p>How would you like to resolve this <strong>{tuName}</strong> session?</p>

  <div class="methods">
    <div class="method">
      <div class="method-header">
        <i class="fas fa-calculator"></i>
        <strong>Bulk Method</strong>
      </div>
      {#if isBulkRoll}
        Expected progress: <strong>{bulkValue}</strong> (one roll).
      {:else}
        Gaining <strong>{bulkValue}</strong> progress fixed.
      {/if}
    </div>

    <div class="method">
      <div class="method-header">
        <i class={isSeparateRoll ? "fas fa-dice-d20" : "fas fa-list-ol"}></i>
        <strong>Separate Method</strong>
      </div>
      {#if isSeparateRoll}
        Expected progress: <strong>{separateValue}</strong> across {ratio} rolls.
        <small>
          {#if chancePercent === "unavailable"}
            Probability unavailable.
          {:else}
            Each hour has a <strong>{chancePercent}%</strong> chance of success (DC {checkDC}).
          {/if}
        </small>
      {:else}
        Gaining <strong>{separateValue}</strong> progress fixed.
      {/if}
      {#if isSeparateRoll && ratio > 5}
        <small class="warning">
          <i class="fas fa-exclamation-triangle"></i>
          Note: This will trigger {ratio} separate
          {ratio > batchThreshold ? "rolls (summarized in one message)" : "roll messages"}.
        </small>
      {/if}
    </div>
  </div>
</div>

<style lang="scss">
  .training-resolution {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.5rem;

    .methods {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .method {
      padding: 0.5rem;
      border: 1px solid var(--t5e-faint-color);
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.05);

      .method-header {
        margin-bottom: 0.25rem;
      }

      small {
        display: block;
        margin-top: 0.25rem;
        opacity: 0.8;
      }

      .warning {
        color: #8a6d3b;
        opacity: 1;
      }
    }
  }
</style>
