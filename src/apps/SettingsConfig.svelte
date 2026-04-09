<script lang="ts">
  import { Settings } from "../core/settings.js";
  import type { SystemRules, TimeUnit, GuidanceTier } from "../types.js";
  import { saveSettings, getAvailablePacks } from "./settings-logic.js";
  import WorldSettingsConfig from "./components/WorldSettingsConfig.svelte";
  import UserPreferencesConfig from "./components/UserPreferencesConfig.svelte";

  // Auth
  const isGM = !!game.user?.isGM;

  // State
  let rules = $state<SystemRules>(Settings.get("rules"));
  let timeUnits = $state<TimeUnit[]>(Settings.get("timeUnits"));
  let guidanceTiers = $state<GuidanceTier[]>(Settings.get("guidanceTiers"));
  let allowedCompendiums = $state<string[]>(Settings.get("allowedCompendiums"));

  // User Preferences
  let autoSpend = $state<boolean>(!isGM ? Settings.get("autoSpend") : false);
  let autoSpendUnits = $state<string[]>(!isGM ? Settings.get("autoSpendUnits") : []);

  // Computed / Constant
  const availablePacks = getAvailablePacks();

  async function save() {
    await saveSettings(
      rules,
      timeUnits,
      guidanceTiers,
      allowedCompendiums,
      autoSpend,
      autoSpendUnits,
    );
  }
</script>

<div class="thefehrs-settings svelte-settings">
  {#if isGM}
    <WorldSettingsConfig
      bind:rules
      bind:timeUnits
      bind:guidanceTiers
      bind:allowedCompendiums
      {availablePacks}
    />
  {:else}
    <UserPreferencesConfig
      bind:autoSpend
      bind:autoSpendUnits
      {timeUnits}
    />
  {/if}


  <div class="footer-actions">
    <button type="button" class="tidy-button primary" onclick={save}>
      <i class="fas fa-save"></i> Save Settings
    </button>
  </div>
</div>

<style lang="scss">
  .thefehrs-settings {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1rem;
    height: 100%;
    overflow-y: auto;

    .footer-actions {
      position: sticky;
      bottom: -1rem;
      background: var(--t5e-background);
      padding: 1rem 0;
      border-top: 1px solid var(--t5e-faint-color);
      display: flex;
      justify-content: center;
      margin-top: auto;
    }
  }
</style>
