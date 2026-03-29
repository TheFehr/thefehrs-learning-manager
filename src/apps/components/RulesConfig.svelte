<script lang="ts">
  import type { SystemRules } from "../../types";

  let { rules = $bindable() } = $props();

  let needsCheckFields = $derived(
    rules.nonBulkMethod === 'roll' || 
    rules.bulkMethod === 'roll' || 
    rules.bulkMethod === 'mathematical'
  );

  let needsBulkFormula = $derived(rules.bulkMethod === 'mathematical');
</script>

<section>
  <h3>Global Rules</h3>
  
  <div class="form-group">
    <label for="rule-non-bulk-method">Non-Bulk Method</label>
    <select id="rule-non-bulk-method" bind:value={rules.nonBulkMethod}>
      <option value="direct">Direct (1 session = 1 progress)</option>
      <option value="roll">Learning Check (Roll vs DC)</option>
    </select>
  </div>

  <div class="form-group">
    <label for="rule-bulk-method">Bulk Method</label>
    <select id="rule-bulk-method" bind:value={rules.bulkMethod}>
      <option value="direct">Direct (Uses Tier Progress values)</option>
      <option value="roll">Learning Check (Roll vs DC)</option>
      <option value="mathematical">Mathematical Expectation (Average)</option>
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

  {#if needsCheckFields}
    <div class="form-group">
      <label for="rule-dc">Check DC</label>
      <input id="rule-dc" type="number" bind:value={rules.checkDC} />
    </div>
    <div class="form-group">
      <label for="rule-formula">Formula</label>
      <input id="rule-formula" type="text" bind:value={rules.checkFormula} placeholder="1d20 + @abilities.int.mod + @tutelage" />
    </div>
    <p class="notes">Available variables: @tutelage and roll data attributes (e.g. @abilities.int.mod)</p>
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

  {#if needsBulkFormula}
    <div class="form-group">
      <label for="rule-bulk-formula">Bulk Expected Formula</label>
      <input id="rule-bulk-formula" type="text" bind:value={rules.bulkExpectedFormula} placeholder="round(@hours * (22 - max(1, @dc - (@abilities.int.mod + @tutelage))) / 20)" />
    </div>
    <p class="notes">Available variables: @hours, @dc, @tutelage and roll data attributes (e.g. @abilities.int.mod)</p>
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
