<script lang="ts">
  import type { SystemRules } from "@/types";
  import { onMount, tick } from "svelte";
  import { Logger } from "@/core/logger.js";
  import { isV14RollModeApiAvailable } from "@/core/foundry.js";

  let { rules = $bindable() } = $props<{ rules: SystemRules }>();

  // Use internal state to ensure reactivity for properties in Svelte 5
  // and sync it with the bindable prop.
  let internalRules = $state<SystemRules>(rules || {
    nonBulkMethod: 'roll',
    bulkMethod: 'mathematical',
    rollMode: 'gmroll',
    checkDC: 12,
    checkFormula: '',
    critDoubleStrategy: 'never',
    critThreshold: 20,
    notificationLevel: 'info',
    bulkExpectedFormula: ''
  });

  $effect(() => {
    rules = internalRules;
  });

  let needsCheckFields = $derived(
    internalRules.nonBulkMethod === 'roll' || 
    internalRules.bulkMethod === 'roll'
  );

  let needsDC = $derived(
    needsCheckFields || internalRules.bulkMethod === 'mathematical'
  )

  let needsBulkFormula = $derived(internalRules.bulkMethod === 'mathematical');

  let rollModes = $state<Record<string, string | { label: string }>>({
    "publicroll": "CHAT.RollPublic",
    "gmroll": "CHAT.RollPrivate",
    "blindroll": "CHAT.RollBlind",
    "selfroll": "CHAT.RollSelf"
  });

  onMount(() => {
    const customModes = isV14RollModeApiAvailable()
      ? globalThis.CONFIG?.ChatMessage?.modes
      : globalThis.CONFIG?.Dice?.rollModes;
    if (customModes && typeof customModes === "object") {
      const updatedModes = { ...rollModes };
      for (const [key, value] of Object.entries(customModes)) {
        if (typeof value === "string" || (typeof value === "object" && value !== null && "label" in value)) {
          updatedModes[key] = value;
        } else {
          Logger.warn(`RulesConfig: Received invalid roll mode config for key "${key}":`, true, value);
        }
      }
      rollModes = updatedModes;
    }
  });

  function getRollModeLabel(value: unknown): string {
    return typeof value === 'object' && value !== null && 'label' in value
      ? (value as { label: string }).label
      : String(value);
  }

  interface FormulaVariable {
    token: string;
    description: string;
  }

  const abilityVariables: FormulaVariable[] = [
    { token: "@abilities.str.mod", description: "Strength modifier" },
    { token: "@abilities.dex.mod", description: "Dexterity modifier" },
    { token: "@abilities.con.mod", description: "Constitution modifier" },
    { token: "@abilities.int.mod", description: "Intelligence modifier" },
    { token: "@abilities.wis.mod", description: "Wisdom modifier" },
    { token: "@abilities.cha.mod", description: "Charisma modifier" },
  ];

  const checkFormulaVariables: FormulaVariable[] = [
    { token: "@tutelage", description: "Instructor tutelage bonus" },
    ...abilityVariables,
  ];

  const bulkFormulaVariables: FormulaVariable[] = [
    { token: "@hours", description: "Hours spent this session" },
    { token: "@dc", description: "Configured check DC" },
    { token: "@tutelage", description: "Instructor tutelage bonus" },
    ...abilityVariables,
  ];

  let checkFormulaInput = $state<HTMLInputElement | undefined>();
  let bulkFormulaInput = $state<HTMLInputElement | undefined>();

  // Inserts at the current cursor position (falling back to the end if the
  // input never had focus) rather than always appending, so picking a
  // variable partway through an existing formula doesn't require the GM to
  // manually cut/paste it into place.
  async function insertVariable(
    field: "checkFormula" | "bulkExpectedFormula",
    token: string,
    inputEl: HTMLInputElement | undefined,
  ) {
    if (!inputEl) return;
    const current = internalRules[field] ?? "";
    const start = inputEl.selectionStart ?? current.length;
    const end = inputEl.selectionEnd ?? current.length;
    internalRules[field] = current.slice(0, start) + token + current.slice(end);
    await tick();
    const cursorPos = start + token.length;
    inputEl.focus();
    inputEl.setSelectionRange(cursorPos, cursorPos);
  }
</script>

<section>
  <h3>Global Rules</h3>
  
  <div class="form-group">
    <label for="rule-non-bulk-method">Non-Bulk Method</label>
    <select id="rule-non-bulk-method" bind:value={internalRules.nonBulkMethod}>
      <option value="direct">Direct (1 session = 1 progress)</option>
      <option value="roll">Learning Check (Roll vs DC)</option>
    </select>
  </div>

  <div class="form-group">
    <label for="rule-bulk-method">Bulk Method</label>
    <select id="rule-bulk-method" bind:value={internalRules.bulkMethod}>
      <option value="direct">Direct (Uses Tier Progress values)</option>
      <option value="roll">Learning Check (Roll vs DC)</option>
      <option value="mathematical">Mathematical Expectation (Average)</option>
    </select>
  </div>

  <div class="form-group">
    <label for="rule-roll-mode">Roll Mode</label>
    <select id="rule-roll-mode" bind:value={internalRules.rollMode}>
      {#each Object.entries(rollModes) as [key, value]}
        <option value={key}>{game?.i18n?.localize(getRollModeLabel(value)) || getRollModeLabel(value)}</option>
      {/each}
    </select>
  </div>

  <div class="form-group">
    <label for="rule-notification-level">Log Level</label>
    <select id="rule-notification-level" bind:value={internalRules.notificationLevel}>
      <option value="none">None</option>
      <option value="error">Error</option>
      <option value="warn">Warn</option>
      <option value="info">Info</option>
      <option value="debug">Debug</option>
    </select>
  </div>

  {#if needsCheckFields}
    <div class="form-group">
      <label for="rule-dc">Check DC</label>
      <input id="rule-dc" type="number" bind:value={internalRules.checkDC} min="0" step="1" inputmode="numeric" />
    </div>
    <div class="form-group">
      <label for="rule-formula">Formula</label>
      <input
        id="rule-formula"
        type="text"
        bind:value={internalRules.checkFormula}
        bind:this={checkFormulaInput}
        placeholder="1d20 + @abilities.int.mod + @tutelage"
      />
    </div>
    <div class="formula-helper">
      <select
        aria-label="Insert variable into Formula"
        onchange={(e) => {
          const token = e.currentTarget.value;
          if (token) insertVariable("checkFormula", token, checkFormulaInput);
          e.currentTarget.value = "";
        }}
      >
        <option value="">Insert variable...</option>
        {#each checkFormulaVariables as v (v.token)}
          <option value={v.token}>{v.token} — {v.description}</option>
        {/each}
      </select>
    </div>
    <p class="notes">Roll data attributes (e.g. @abilities.int.mod) can also be typed directly.</p>
    <div class="form-group">
      <label for="rule-crit">Crit Strategy</label>
      <select id="rule-crit" bind:value={internalRules.critDoubleStrategy}>
        <option value="never">Never double</option>
        <option value="any">Double if any die >= threshold</option>
        <option value="all">Double if all dice >= threshold</option>
      </select>
    </div>
    <div class="form-group">
      <label for="rule-threshold">Crit Threshold</label>
      <input id="rule-threshold" type="number" bind:value={internalRules.critThreshold} min="1" max="20" />
    </div>
  {/if}

  {#if needsDC && !needsCheckFields}
    <div class="form-group">
      <label for="rule-dc">Check DC</label>
      <input id="rule-dc" type="number" bind:value={internalRules.checkDC} />
    </div>
  {/if}

  {#if needsBulkFormula}
    <div class="form-group">
      <label for="rule-bulk-formula">Bulk Expected Formula</label>
      <input
        id="rule-bulk-formula"
        type="text"
        bind:value={internalRules.bulkExpectedFormula}
        bind:this={bulkFormulaInput}
        placeholder="round(@hours * (22 - max(1, @dc - (@abilities.int.mod + @tutelage))) / 20)"
      />
    </div>
    <div class="formula-helper">
      <select
        aria-label="Insert variable into Bulk Expected Formula"
        onchange={(e) => {
          const token = e.currentTarget.value;
          if (token) insertVariable("bulkExpectedFormula", token, bulkFormulaInput);
          e.currentTarget.value = "";
        }}
      >
        <option value="">Insert variable...</option>
        {#each bulkFormulaVariables as v (v.token)}
          <option value={v.token}>{v.token} — {v.description}</option>
        {/each}
      </select>
    </div>
    <p class="notes">Roll data attributes (e.g. @abilities.int.mod) can also be typed directly.</p>
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

  .formula-helper {
    margin-left: 160px;
    margin-bottom: 0.5rem;

    select {
      font-size: 0.8rem;
      max-width: 100%;
    }
  }
</style>
