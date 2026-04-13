<script lang="ts">
  import { Settings } from "@/core/settings.js";
  import type { Actor5e, TeacherOffering } from "@/types.js";
  import { untrack } from "svelte";
  import { ActorConfigLogic } from "@/logic/actor-config-logic.js";
  import CategorySelector from "@/apps/components/CategorySelector.svelte";

  let { actor } = $props<{ actor: Actor5e }>();

  let offerings = $state<TeacherOffering[]>([]);
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
    offerings = data.map(o => ({
      ...o,
      categories: o.categories || []
    }));
    
    initialSnapshot = JSON.stringify(offerings);
    initialized = true;
  });

  // Auto-save logic
  $effect(() => {
    const currentOfferings = offerings;
    if (!untrack(() => initialized)) return;

    const currentSnapshot = JSON.stringify(currentOfferings);
    if (currentSnapshot === untrack(() => initialSnapshot)) return;

    const timeout = setTimeout(() => {
      saveConfig(JSON.parse(JSON.stringify(currentOfferings)));
    }, 500);

    return () => clearTimeout(timeout);
  });

  async function saveConfig(data: TeacherOffering[]) {
    const token = ++saveCounter;
    isSaving = true;
    saveError = null;
    try {
      await ActorConfigLogic.saveConfig(actor, data);
      if (token === saveCounter) {
        initialSnapshot = JSON.stringify(data);
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
  <header>
    <h3>Downtime Engine: Tutelage Configuration</h3>
    <p class="notes">Configure the lessons this instructor offers.</p>
  </header>

  <div class="offerings-list">
    {#each offerings as offering, i}
      <section class="offering-card">
        <div class="offering-header">
          <input type="text" data-testid="lesson-name-input" bind:value={offering.name} placeholder="Lesson Name (e.g. Masterclass)" />
          <button type="button" class="tidy-button small danger" onclick={(e) => { e.stopPropagation(); removeOffering(i); }} title="Remove Offering">
            <i class="fas fa-trash"></i>
          </button>
        </div>

        <div class="form-group">
          <label for="mod-{i}">Learning Modifier</label>
          <input id="mod-{i}" type="number" bind:value={offering.modifier} min="0" placeholder="e.g. 5" />
        </div>

        <div class="costs-section" data-testid="costs-per-session">
          <h5>Costs per Session</h5>
          <div class="costs-grid">
            {#each timeUnits as unit}
              <div class="cost-row">
                <label for="cost-{i}-{unit.id}">{unit.name}</label>
                <div class="currency-input">
                  <input id="cost-{i}-{unit.id}" type="number" bind:value={offering.costs[unit.id]} min="0" placeholder="0" />
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

  <footer class="auto-save-footer">
    {#if isSaving}
      <span class="saving-indicator"><i class="fas fa-spinner fa-spin"></i> Saving...</span>
    {:else if saveError}
      <span class="error-indicator"><i class="fas fa-exclamation-triangle"></i> Save Failed</span>
    {:else}
      <span class="saved-indicator"><i class="fas fa-check"></i> All changes saved</span>
    {/if}
  </footer>
</div>

<style lang="scss">
  .thefehrs-actor-tutelage-config {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
    overflow-y: auto;

    h3, h5 {
      border-bottom: 1px solid var(--t5e-faint-color);
      padding-bottom: 0.5rem;
      margin-top: 0;
    }

    h5 {
        border-bottom: none;
        padding-bottom: 0;
        margin-top: 0.5rem;
        font-size: 0.95rem;
    }

    .notes {
      font-size: 0.85rem;
      color: var(--t5e-secondary-color);
      margin-bottom: 0.5rem;
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

    .auto-save-footer {
      margin-top: auto;
      padding-top: 1rem;
      display: flex;
      justify-content: flex-end;
      font-size: 0.8rem;
      opacity: 0.7;

      .saving-indicator { color: var(--t5e-primary-accent-color); }
      .saved-indicator { color: var(--t5e-success-color); }
      .error-indicator { color: var(--t5e-danger-color); }
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
