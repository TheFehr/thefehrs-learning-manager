<script lang="ts">
  import { onMount } from "svelte";
  import {Logger} from "@/core/logger";
  import { Settings } from "@/core/settings.js";
  import type { SystemRules, TimeUnit } from "@/types.js";
  import { saveSettings, getAvailablePacks, type PackInfo } from "@/logic/settings-logic.js";
  import WorldSettingsConfig from "./components/WorldSettingsConfig.svelte";
  import UserPreferencesConfig from "./components/UserPreferencesConfig.svelte";
  import AutoSaveBanner from "./components/AutoSaveBanner.svelte";

  // Auth
  const isGM = !!game.user?.isGM;

  // State
  let rules = $state<SystemRules>(Settings.get("rules"));
  let timeUnits = $state<TimeUnit[]>(Settings.get("timeUnits"));
  let teacherCompendiums = $state<string[]>(Settings.get("teacherCompendiums"));
  let bookCompendiums = $state<string[]>(Settings.get("bookCompendiums"));
  let allowedCompendiums = $state<string[]>(Settings.get("allowedCompendiums"));
  let scanWorldActors = $state<boolean>(Settings.get("scanWorldActors"));

  // User Preferences
  let autoSpend = $state<boolean>(!isGM ? Settings.get("autoSpend") : false);
  let autoSpendUnits = $state<string[]>(!isGM ? Settings.get("autoSpendUnits") : []);

  // Pack state
  let availableItemPacks = $state<PackInfo[]>([]);
  let instructorPacks = $state<PackInfo[]>([]);
  let bookPacks = $state<PackInfo[]>([]);

  // Feedback-only: saving still requires an explicit click of Save Settings
  // below (this form batches several unrelated settings together, so
  // autosaving every field change - as the per-item/per-actor tabs do - isn't
  // a good fit here). These just drive the same status banner those tabs use,
  // for consistent feedback on the manual save action.
  let isSaving = $state(false);
  let saveError = $state<string | null>(null);
  let hasSaved = $state(false);

  // Clears the "All changes saved" banner as soon as any bound setting
  // actually changes, rather than leaving it up (and wrong) until the next
  // save click. save() itself never mutates these, so this only fires on a
  // real edit, not as a side effect of saving.
  $effect(() => {
    void rules;
    void timeUnits;
    void teacherCompendiums;
    void bookCompendiums;
    void allowedCompendiums;
    void scanWorldActors;
    void autoSpend;
    void autoSpendUnits;
    hasSaved = false;
  });

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
        // false = no UI toast; pack-load failures are non-critical during init and console-only is sufficient
        Logger.error("Failed to load item packs:", false, results[0].reason);
      }

      if (results[1].status === "fulfilled") {
        instructorPacks = results[1].value;
      } else {
        Logger.error("Failed to load instructor packs:", false, results[1].reason);
      }

      if (results[2].status === "fulfilled") {
        bookPacks = results[2].value;
      } else {
        Logger.error("Failed to load book packs:", false, results[2].reason);
      }
    }
  });

  async function save() {
    // A second click reaching here while the first save is still awaiting
    // Settings.set() would let two in-flight writes race: whichever
    // resolves last wins, and each captured the scalar state at its own
    // click time, so an older write finishing after a newer one can
    // silently clobber a more recent edit with stale values.
    if (isSaving) return;
    isSaving = true;
    saveError = null;
    try {
      const success = await saveSettings(
        rules,
        timeUnits,
        teacherCompendiums,
        bookCompendiums,
        allowedCompendiums,
        autoSpend,
        autoSpendUnits,
        scanWorldActors,
      );
      hasSaved = success;
      if (!success) {
        saveError = "Failed to save settings - see notifications for details.";
      }
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="thefehrs-settings svelte-settings">
  <AutoSaveBanner {isSaving} {saveError} {hasSaved} />

  {#if isGM}
    <WorldSettingsConfig
      bind:rules
      bind:timeUnits
      bind:teacherCompendiums
      bind:bookCompendiums
      bind:allowedCompendiums
      bind:scanWorldActors
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
    <button type="button" class="tidy-button primary" onclick={save} disabled={isSaving}>
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
