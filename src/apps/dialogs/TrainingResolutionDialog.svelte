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
    currentProgress,
    target,
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
    currentProgress: number;
    target: number;
  } = $props();

  // Projected totals are estimates for roll-based methods (the actual gain
  // depends on the roll) and exact for fixed ones - shown the same way in
  // both cases since the gain values above are already labeled "Expected"
  // when they are estimates. Capped at target: a roll-based estimate can
  // overshoot it, and showing e.g. "22/20" here would just be confusing.
  //
  // currentProgress/target come from persisted item flags (arbitrary JSON),
  // not a value this component controls - project-engine.ts rejects a
  // missing or non-positive target before mounting this dialog, but not
  // Infinity, and currentProgress isn't validated there at all. Number.isFinite
  // catches both that and NaN (unlike the old isNaN(gainNum) check, which let
  // an Infinity gain through) - fall back to "unavailable" rather than
  // silently rendering a concatenated string or NaN.
  function projectedTotal(gain: string | number): string {
    const gainNum = typeof gain === "number" ? gain : parseFloat(gain);
    if (
      !Number.isFinite(gainNum) ||
      !Number.isFinite(currentProgress) ||
      !Number.isFinite(target) ||
      target <= 0
    ) {
      return "unavailable";
    }
    return `${Math.min(currentProgress + gainNum, target)} / ${target}`;
  }

  // Same validation as projectedTotal, for the raw current-progress line
  // below - it interpolates currentProgress/target directly rather than
  // going through that function, so it needs its own guard against the same
  // malformed persisted values.
  let progressHeader = $derived(
    Number.isFinite(currentProgress) && Number.isFinite(target) && target > 0
      ? `${currentProgress} / ${target}`
      : "unavailable",
  );
</script>

<div class="training-resolution">
  <p class="current-progress">
    Current progress: <strong>{progressHeader}</strong>
  </p>
  <p>How would you like to resolve this <strong>{tuName}</strong> session?</p>

  <div class="methods">
    <div class="method">
      <div class="method-header">
        <i class="fas fa-calculator"></i>
        <strong>Bulk Method</strong>
      </div>
      {#if isBulkRoll}
        Expected progress: <strong>{bulkValue}</strong> (one roll) &rarr; projected total: <strong>{projectedTotal(bulkValue)}</strong>.
      {:else}
        Gaining <strong>{bulkValue}</strong> progress fixed &rarr; new total: <strong>{projectedTotal(bulkValue)}</strong>.
      {/if}
    </div>

    <div class="method">
      <div class="method-header">
        <i class={isSeparateRoll ? "fas fa-dice-d20" : "fas fa-list-ol"}></i>
        <strong>Separate Method</strong>
      </div>
      {#if isSeparateRoll}
        Expected progress: <strong>{separateValue}</strong> across {ratio} rolls &rarr; projected total: <strong>{projectedTotal(separateValue)}</strong>.
        <small>
          {#if chancePercent === "unavailable"}
            Probability unavailable.
          {:else}
            Each hour has a <strong>{chancePercent}%</strong> chance of success (DC {checkDC}).
          {/if}
        </small>
      {:else}
        Gaining <strong>{separateValue}</strong> progress fixed &rarr; new total: <strong>{projectedTotal(separateValue)}</strong>.
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

    .current-progress {
      margin: 0;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--t5e-faint-color);
    }

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
