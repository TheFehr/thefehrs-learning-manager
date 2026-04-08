<script lang="ts">
  import type { SystemRules, TimeUnit, GuidanceTier } from "../../types.js";
  import RulesConfig from "./RulesConfig.svelte";
  import CompendiumConfig from "./CompendiumConfig.svelte";
  import TimeUnitsConfig from "./TimeUnitsConfig.svelte";
  import GuidanceConfig from "./GuidanceConfig.svelte";
  import { validateSettings } from "../settings-logic.js";

  interface Pack {
    id: string;
    label: string;
    [key: string]: any;
  }

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
    availablePacks: Pack[];
  }>();

  function exportSettings() {
    const data = {
      rules,
      timeUnits,
      guidanceTiers,
      allowedCompendiums,
    };
    foundry.utils.saveDataToFile(
      JSON.stringify(data, null, 2),
      "application/json",
      "downtime-engine-settings.json",
    );
  }

  function importSettings() {
    const input = document.createElement("input");
    try {
      input.type = "file";
      input.accept = ".json";
      input.style.display = "none";
      document.body.appendChild(input);

      let fileSelected = false;

      const cleanup = () => {
        window.removeEventListener("focus", handleCancel);
        document.removeEventListener("visibilitychange", handleCancel);
        input.onchange = null;
        if (input.parentNode) input.remove();
      };

    const handleCancel = () => {
      // Delay slightly to allow onchange to fire first if a file WAS selected.
      // Focus usually fires after the file dialog closes.
      setTimeout(() => {
        if (!fileSelected && input.parentNode) {
          cleanup();
        }
      }, 500);
    };

      window.addEventListener("focus", handleCancel, { once: true });
      document.addEventListener("visibilitychange", handleCancel, { once: true });

      input.onchange = (e: Event) => {
        fileSelected = true;
        const target = e.target as HTMLInputElement;
        if (!target.files?.length) {
          cleanup();
          return;
        }
        const file = target.files[0];
        const reader = new FileReader();

        const readerCleanup = () => {
          reader.onload = null;
          reader.onerror = null;
          reader.onabort = null;
          cleanup();
        };

        reader.onerror = () => {
          ui.notifications?.error("Downtime Engine | Failed to read settings file.");
          console.error("Downtime Engine | FileReader error:", reader.error);
          readerCleanup();
        };
        reader.onabort = () => {
          ui.notifications?.warn("Downtime Engine | Settings import aborted.");
          readerCleanup();
        };
        reader.onload = async (event: ProgressEvent<FileReader>) => {
          try {
            const content = event.target?.result as string;
            const data = JSON.parse(content);
            const validated = validateSettings(data);

            if (validated.rules !== undefined) rules = validated.rules;
            if (validated.timeUnits !== undefined) timeUnits = validated.timeUnits;
            if (validated.guidanceTiers !== undefined) guidanceTiers = validated.guidanceTiers;
            if (validated.allowedCompendiums !== undefined)
              allowedCompendiums = validated.allowedCompendiums;

            ui.notifications?.info(
              "Downtime Engine | Settings imported. Click Save to persist.",
            );
          } catch (err: unknown) {
            if (err instanceof SyntaxError) {
              ui.notifications?.error("Downtime Engine | Failed to import settings: Invalid JSON format. Please check for trailing commas or missing braces.");
            } else {
              const msg = err instanceof Error ? err.message : String(err);
              ui.notifications?.error(`Downtime Engine | Failed to import settings: ${msg}`);
            }
            console.error("Downtime Engine | Import error:", err);
          } finally {
            readerCleanup();
          }
        };

        try {
          reader.readAsText(file);
        } catch (err) {
          ui.notifications?.error("Downtime Engine | Failed to start reading settings file.");
          console.error("Downtime Engine | FileReader sync error:", err);
          readerCleanup();
        }
      };
      input.click();
    } catch (err) {
      console.error("Downtime Engine | Failed to initialize settings import:", err);
      if (input.parentNode) input.remove();
    }
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
  <GuidanceConfig bind:guidanceTiers {timeUnits} {rules} />
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
