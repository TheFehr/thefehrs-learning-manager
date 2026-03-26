<script lang="ts">
  import type { SystemRules, TimeUnit, GuidanceTier } from "../../types.js";
  import RulesConfig from "./RulesConfig.svelte";
  import CompendiumConfig from "./CompendiumConfig.svelte";
  import TimeUnitsConfig from "./TimeUnitsConfig.svelte";
  import GuidanceConfig from "./GuidanceConfig.svelte";
  import { validateSettings } from "../settings-logic.js";

  let {
    rules = $bindable(),
    timeUnits = $bindable(),
    guidanceTiers = $bindable(),
    allowedCompendiums = $bindable(),
    availablePacks = [],
  } = $props<{
    rules: SystemRules;
    timeUnits: TimeUnit[];
    guidanceTiers: GuidanceTier[];
    allowedCompendiums: string[];
    availablePacks: any[];
  }>();

  function exportSettings() {
    const data = {
      rules,
      timeUnits,
      guidanceTiers,
      allowedCompendiums,
    };
    saveDataToFile(
      JSON.stringify(data, null, 2),
      "text/json",
      "downtime-engine-settings.json",
    );
  }

  function importSettings() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (!target.files?.length) return;
      const file = target.files[0];
      const reader = new FileReader();
      reader.onload = async (event: ProgressEvent<FileReader>) => {
        try {
          const content = event.target?.result as string;
          const data = JSON.parse(content);
          const validated = validateSettings(data);

          if (validated.rules) rules = validated.rules;
          if (validated.timeUnits) timeUnits = validated.timeUnits;
          if (validated.guidanceTiers) guidanceTiers = validated.guidanceTiers;
          if (validated.allowedCompendiums)
            allowedCompendiums = validated.allowedCompendiums;

          ui.notifications?.info(
            "Downtime Engine | Settings imported. Click Save to persist.",
          );
        } catch (err: unknown) {
          const error = err as Error;
          ui.notifications?.error("Failed to import settings: " + error.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
</script>

<div class="world-settings">
  <div class="header-actions">
    <button
      type="button"
      class="tidy-button"
      onclick={exportSettings}
      title="Export Settings"
    >
      <i class="fas fa-file-export"></i> Export
    </button>
    <button
      type="button"
      class="tidy-button"
      onclick={importSettings}
      title="Import Settings"
    >
      <i class="fas fa-file-import"></i> Import
    </button>
  </div>

  <RulesConfig bind:rules />
  <hr />
  <CompendiumConfig bind:allowedCompendiums {availablePacks} />
  <hr />
  <TimeUnitsConfig bind:timeUnits />
  <hr />
  <GuidanceConfig bind:guidanceTiers {timeUnits} />
  <hr />
</div>

<style lang="scss">
  .world-settings {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    .header-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
  }

  hr {
    width: 100%;
    border: 0;
    border-top: 1px solid var(--t5e-faint-color);
    margin: 0.5rem 0;
  }
</style>
