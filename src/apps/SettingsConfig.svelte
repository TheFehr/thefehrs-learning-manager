<script lang="ts">
  import { Settings } from "../core/settings.js";
  import type { SystemRules, TimeUnit } from "../types.js";
  import { saveSettings, getAvailablePacks, type PackInfo } from "../logic/settings-logic.js";
  import WorldSettingsConfig from "./components/WorldSettingsConfig.svelte";
  import UserPreferencesConfig from "./components/UserPreferencesConfig.svelte";
  import { onMount } from "svelte";

  // Auth
  const isGM = !!game.user?.isGM;

  // State
  let rules = $state<SystemRules>(Settings.get("rules"));
  let timeUnits = $state<TimeUnit[]>(Settings.get("timeUnits"));
  let teacherCompendiums = $state<string[]>(Settings.get("teacherCompendiums"));
  let bookCompendiums = $state<string[]>(Settings.get("bookCompendiums"));
  let allowedCompendiums = $state<string[]>(Settings.get("allowedCompendiums"));

  // User Preferences
  let autoSpend = $state<boolean>(!isGM ? Settings.get("autoSpend") : false);
  let autoSpendUnits = $state<string[]>(!isGM ? Settings.get("autoSpendUnits") : []);

  // Pack state
  let availableItemPacks = $state<PackInfo[]>([]);
  let instructorPacks = $state<PackInfo[]>([]);
  let bookPacks = $state<PackInfo[]>([]);

  onMount(async () => {
    if (isGM) {
      const results = await Promise.allSettled([
        getAvailablePacks("Item"),
        getAvailablePacks("Actor", "teacherOfferings"),
        getAvailablePacks("Item", "learningBookBonus"),
      ]);

      if (results[0].status === "fulfilled") {
        availableItemPacks = results[0].value;
      } else {
        Logger.error("Failed to load item packs:", results[0].reason);
        availableItemPacks = [];
      }

      if (results[1].status === "fulfilled") {
        instructorPacks = results[1].value;
      } else {
        Logger.error("Failed to load instructor packs:", results[1].reason);
        instructorPacks = [];
      }

      if (results[2].status === "fulfilled") {
        bookPacks = results[2].value;
      } else {
        Logger.error("Failed to load book packs:", results[2].reason);
        bookPacks = [];
      }
    }
  });

  async function save() {
    await saveSettings(
      rules,
      timeUnits,
      teacherCompendiums,
      bookCompendiums,
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
      bind:teacherCompendiums
      bind:bookCompendiums
      bind:allowedCompendiums
      {availableItemPacks}
      {instructorPacks}
      {bookPacks}
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
