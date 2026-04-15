<script lang="ts">
  import { Settings } from "@/core/settings.js";
  import { TabLogic } from "@/logic/tab-logic.js";
  import type { Actor5e, TeacherOffering } from "@/types.js";
  import { untrack } from "svelte";
  import { ActorConfigLogic } from "@/logic/actor-config-logic.js";
  import CategorySelector from "@/apps/components/CategorySelector.svelte";
  import AutoSaveBanner from "@/apps/components/AutoSaveBanner.svelte";

  let { actor } = $props<{ actor: Actor5e }>();

  let offerings = $state<TeacherOffering[]>([]);
  let learningModeEnabled = $state(false);
  let isSaving = $state(false);
  let saveError = $state<string | null>(null);
  let initialized = $state(false);
  let initialSnapshot = $state<string>("");
  let saveCounter = 0;

  const timeUnits = Settings.get("timeUnits") || [];

  // Initialize from actor flags once
  $effect(() => {
    if (untrack(() => initialized)) return;
    const data = (actor.getFlag("thefehrs-learning-manager", "teacherOfferings") as TeacherOffering[]) || [];
    learningModeEnabled = (actor.getFlag("thefehrs-learning-manager", "learningModeEnabled") as boolean) ?? data.length > 0;
    offerings = data.map(o => {
      const costs = { ...(o.costs || {}) };
      for (const unit of timeUnits) {
        costs[unit.id] = costs[unit.id] || 0;
      }
      return {
        ...o,
        categories: Array.isArray(o.categories) ? o.categories : [],
        costs
      };
    });
    
    initialSnapshot = JSON.stringify({ offerings, learningModeEnabled });
    initialized = true;
  });

  // Auto-save logic
  $effect(() => {
    const currentOfferings = offerings;
    const currentEnabled = learningModeEnabled;
    if (!untrack(() => initialized)) return;

    const currentSnapshot = JSON.stringify({ offerings: currentOfferings, learningModeEnabled: currentEnabled });
    if (currentSnapshot === untrack(() => initialSnapshot)) return;

    const timeout = setTimeout(() => {
      saveConfig(JSON.parse(JSON.stringify(currentOfferings)), currentEnabled);
    }, 500);

    return () => clearTimeout(timeout);
  });

  async function saveConfig(data: TeacherOffering[], enabled: boolean) {
    const token = ++saveCounter;
    isSaving = true;
    saveError = null;
    try {
      const ok = await ActorConfigLogic.saveConfig(actor, data, enabled);
      if (token === saveCounter) {
        if (ok === false) {
          saveError = "Failed to save configuration. Please try again.";
        } else {
          initialSnapshot = JSON.stringify({ offerings: data, learningModeEnabled: enabled });
        }
      }
    } catch (err) {
      if (token === saveCounter) {
        saveError = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (token === saveCounter) {
        isSaving = false;
      }
    }
  }

  function addOffering() {
    const costs: Record<string, number> = {};
    for (const unit of timeUnits) {
      costs[unit.id] = 0;
    }
    
    offerings = [...offerings, {
      name: "New Lesson",
      modifier: 0,
      costs,
      categories: [],
    }];
  }

  function removeOffering(index: number) {
    offerings = offerings.filter((_, i) => i !== index);
  }
</script>

<div class="thefehrs-actor-tutelage-config">
  <AutoSaveBanner {isSaving} {saveError} />

  <div class="learning-mode-toggle">
    <div class="form-group" style="margin: 0; padding: 0; background: none; border: none; flex-direction: row; flex-wrap: nowrap; align-items: center; justify-content: space-between;">
      <label for="learning-mode-enabled" style="font-weight: bold; cursor: pointer; margin-bottom: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Enable Instructor Configuration</label>
      <div class="form-fields" style="display: flex; justify-content: flex-end; flex: 0 0 30px;">
        <input id="learning-mode-enabled" type="checkbox" bind:checked={learningModeEnabled} style="width: auto; margin: 0; cursor: pointer;" />
      </div>
    </div>
    <p class="notes">Allow this actor to offer lessons and training to players.</p>
  </div>

  {#if learningModeEnabled}
  <hr style="margin: 0;" />
  <div class="offerings-list">
    {#each offerings as offering, i}
      <section class="offering-card">
        <div class="offering-header">
          <input type="text" data-testid="lesson-name-input" bind:value={offering.name} placeholder="Lesson Name (e.g. Masterclass)" />
          <button type="button" class="tidy-button small danger" onclick={(e) => { e.stopPropagation(); removeOffering(i); }} title="Remove Offering" aria-label="Remove offering">
            <i class="fas fa-trash"></i>
          </button>
        </div>

        <div class="form-group">
          <label for="mod-{i}">Learning Modifier</label>
          <input
            id="mod-{i}"
            type="number"
            value={offering.modifier}
            onchange={(e) => {
              offering.modifier = Math.max(0, Number(e.currentTarget.value) || 0);
              e.stopPropagation();
            }}
            min="0"
            placeholder="e.g. 5"
          />
        </div>

        <div class="costs-section" data-testid="costs-per-session">
          <h5>Costs per Session</h5>
          <div class="costs-grid">
            {#each timeUnits as unit}
              <div class="cost-row">
                <label for="cost-{i}-{unit.id}">{unit.name}</label>
                <div class="currency-input">
                  <input id="cost-{i}-{unit.id}" type="number" bind:value={offering.costs[unit.id]} min="0" placeholder="0" data-tooltip={TabLogic.formatCurrency(Number(offering.costs[unit.id]) || 0)} />
                  <span class="unit">CP</span>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="projects-section categories-section">
            <h5>Applicable Categories</h5>
            <p class="notes">Match projects with these categories (many-to-many).</p>
            <CategorySelector bind:categories={offering.categories} />
        </div>
      </section>
    {/each}
  </div>

  <button type="button" class="tidy-button" onclick={(e) => { e.stopPropagation(); addOffering(); }} style="margin-top: 1rem;">
    <i class="fas fa-plus"></i> Add New Lesson
  </button>
  {/if}
</div>

<style lang="scss">
  .thefehrs-actor-tutelage-config {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;

    h5 {
      margin-top: 0.5rem;
      font-size: 0.95rem;
    }

    .notes {
      font-size: 0.85rem;
      color: var(--t5e-secondary-color);
      margin-bottom: 0.5rem;
    }

    .learning-mode-toggle {
      .notes {
        margin-top: 0.25rem;
        margin-bottom: 0;
        font-size: 0.85rem;
        color: var(--t5e-secondary-color);
      }
    }

    .offerings-list {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .offering-card {
      padding: 1rem;
      border: 1px solid var(--t5e-faint-color);
      border-radius: 4px;
      background: rgba(0,0,0,0.02);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;

      .offering-header {
        display: flex;
        gap: 0.5rem;
        input {
          flex: 1;
          font-weight: bold;
          font-size: 1.1rem;
        }
      }

      .form-group {
        display: flex;
        align-items: center;
        gap: 1rem;
        label { font-weight: bold; min-width: 140px; }
        input { width: 80px; }
      }
    }

    .costs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 0.75rem;
      background: var(--t5e-faint-color);
      padding: 0.75rem;
      border-radius: 4px;
      border: 1px solid var(--t5e-faint-color);

      .cost-row {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        label { font-size: 0.8rem; }
        .currency-input {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          input { width: 100%; }
          .unit { font-size: 0.7rem; font-weight: bold; }
        }
      }
    }

    .categories-section {
        border-top: 1px solid var(--t5e-faint-color);
        padding-top: 0.5rem;
    }

    button.danger {
      color: var(--t5e-danger-color);
      &:hover {
        background: var(--t5e-danger-color);
        color: white;
        border-color: var(--t5e-danger-color);
      }
    }
  }
</style>
