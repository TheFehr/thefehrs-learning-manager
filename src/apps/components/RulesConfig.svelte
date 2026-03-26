<script lang="ts">
  import type { SystemRules } from "../../types";

  let { rules = $bindable() } = $props();
</script>

<section>
  <h3>Global Rules</h3>
  <div class="form-group">
    <label for="rule-method">Method</label>
    <select id="rule-method" bind:value={rules.method}>
      <option value="direct">1 Base Unit = 1 Progress</option>
      <option value="roll">Learning Check</option>
      <option value="mathematical">Mathematical Expectation (DC 12)</option>
    </select>
  </div>

  <div class="form-group">
    <label for="rule-roll-mode">Roll Mode</label>
    <select id="rule-roll-mode" bind:value={rules.rollMode}>
      {#each Object.entries(CONFIG.Dice.rollModes) as [key, value]}
        {@const label = typeof value === 'object' && value !== null && 'label' in value ? value.label : value}
        <option value={key}>{game.i18n.localize(label)}</option>
      {/each}
    </select>
  </div>

  {#if rules.method === 'roll' || rules.method === 'mathematical'}
    <div class="form-group">
      <label for="rule-dc">Check DC</label>
      <input id="rule-dc" type="number" bind:value={rules.checkDC} />
    </div>
    <div class="form-group">
      <label for="rule-formula">Formula</label>
      <input id="rule-formula" type="text" bind:value={rules.checkFormula} placeholder="1d20 + @attributes.int.mod + @tutelage" />
    </div>
    <div class="form-group">
      <label for="rule-crit">Crit Strategy</label>
      <select id="rule-crit" bind:value={rules.critDoubleStrategy}>
        <option value="never">Never double</option>
        <option value="any">Double if any die >= threshold</option>
        <option value="all">Double if all dice >= threshold</option>
      </select>
    </div>
    <div class="form-group">
      <label for="rule-threshold">Crit Threshold</label>
      <input id="rule-threshold" type="number" bind:value={rules.critThreshold} min="1" max="20" />
    </div>
  {/if}

  {#if rules.method === 'mathematical'}
    <div class="form-group">
      <label for="rule-bulk-formula">Average Formula</label>
      <input id="rule-bulk-formula" type="text" bind:value={rules.bulkExpectedFormula} placeholder="round(@hours * (22 - max(1, @dc - @mod)) / 20)" />
    </div>
    <p class="notes">Available variables: @hours, @dc, @mod</p>
  {/if}
</section>

<style lang="scss">
  .form-group {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;

    label {
      flex: 0 0 150px;
      font-weight: bold;
    }

    input, select {
      flex: 1;
    }
  }

  .notes {
    font-size: 0.8rem;
    color: var(--t5e-secondary-color);
    font-style: italic;
    margin-top: -0.25rem;
    margin-bottom: 0.5rem;
    margin-left: 160px;
  }
</style>
