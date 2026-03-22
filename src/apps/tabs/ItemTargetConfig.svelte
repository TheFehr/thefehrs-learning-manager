<script lang="ts">
  import { Settings } from "../../core/settings.js";
  import type { ProjectRequirement, ComparisonOperator, Item5e } from "../../types.js";

  let { item } = $props<{ item: Item5e }>();

  let targetValue = $state(0);
  let requirements = $state<ProjectRequirement[]>([]);
  let isSaving = $state(false);
  let initialized = false;

  const operatorChoices: Record<ComparisonOperator, string> = {
    "===": "Equal To",
    "!==": "Not Equal To",
    ">": "Greater Than",
    ">=": "Greater Than or Equal To",
    "<": "Less Than",
    "<=": "Less Than or Equal To",
    "includes": "Includes (Array/String)"
  };

  // Initialize from item flags once
  $effect(() => {
    if (initialized) return;
    const data = item.getFlag("thefehrs-learning-manager", "projectData");
    targetValue = data?.target ?? 0;
    requirements = data?.requirements ? JSON.parse(JSON.stringify(data.requirements)) : [];
    initialized = true;
  });

  // Auto-save logic
  $effect(() => {
    if (!initialized) return;
    
    // De-referenced to track dependencies
    const t = targetValue;
    const r = JSON.parse(JSON.stringify(requirements));

    const timeout = setTimeout(() => {
      saveConfig(t, r);
    }, 500);

    return () => clearTimeout(timeout);
  });

  async function saveConfig(t: number, r: ProjectRequirement[]) {
    isSaving = true;
    try {
      await item.setFlag("thefehrs-learning-manager", "projectData", {
        target: t,
        requirements: r
      });
    } finally {
      setTimeout(() => isSaving = false, 500);
    }
  }

  function addRequirement() {
    requirements.push({
      id: (foundry.utils as unknown as { randomID: () => string }).randomID(),
      attribute: "system.abilities.int.value",
      operator: ">=",
      value: "10"
    });
  }

  function removeRequirement(id: string) {
    requirements = requirements.filter(r => r.id !== id);
  }
</script>

<div class="thefehrs-item-target-config">
  <header>
    <h3>Downtime Engine: Learning Configuration</h3>
    <p class="notes">Configure how this item is learned by players.</p>
  </header>

  <div class="form-group">
    <label for="target-progress">Target Progress (Base Units)</label>
    <div class="form-fields">
      <input
        id="target-progress"
        type="number"
        bind:value={targetValue}
        min="0"
        placeholder="e.g. 10"
      />
    </div>
  </div>

  <hr />

  <section class="requirements-section">
    <h4>Requirements</h4>
    <p class="notes">Players must meet these criteria to start learning this item.</p>
    
    <div class="requirements-list">
      {#each requirements as req}
        <div class="requirement-row">
          <input type="text" bind:value={req.attribute} placeholder="Attribute Path" title="e.g. system.abilities.str.value" />
          <select bind:value={req.operator}>
            {#each Object.entries(operatorChoices) as [op, label]}
              <option value={op}>{label}</option>
            {/each}
          </select>
          <input type="text" bind:value={req.value} placeholder="Value" />
          <button type="button" class="tidy-button small danger" onclick={() => removeRequirement(req.id)} title="Remove Requirement">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      {/each}
    </div>

    <button type="button" class="tidy-button small" onclick={addRequirement}>
      <i class="fas fa-plus"></i> Add Requirement
    </button>
  </section>

  <footer class="auto-save-footer">
    {#if isSaving}
      <span class="saving-indicator"><i class="fas fa-spinner fa-spin"></i> Saving...</span>
    {:else}
      <span class="saved-indicator"><i class="fas fa-check"></i> All changes saved</span>
    {/if}
  </footer>
</div>

<style lang="scss">
  .thefehrs-item-target-config {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
    overflow-y: auto;

    h3, h4 {
      border-bottom: 1px solid var(--t5e-faint-color);
      padding-bottom: 0.5rem;
      margin-top: 0;
    }

    .notes {
      font-size: 0.85rem;
      color: var(--t5e-secondary-color);
      margin-bottom: 0.5rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      label {
        font-weight: bold;
      }

      input {
        width: 100%;
      }
    }

    .requirements-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 0.5rem;

      .requirement-row {
        display: flex;
        gap: 0.5rem;
        align-items: center;

        input:first-child { flex: 2; }
        select { flex: 1.5; }
        input:nth-child(3) { flex: 1; }
      }
    }

    .auto-save-footer {
      margin-top: auto;
      padding-top: 1rem;
      display: flex;
      justify-content: flex-end;
      font-size: 0.8rem;
      opacity: 0.7;

      .saving-indicator {
        color: var(--t5e-primary-accent-color);
      }

      .saved-indicator {
        color: var(--t5e-success-color);
      }
    }

    button.danger {
      color: var(--t5e-danger-color);
      &:hover {
        background: var(--t5e-danger-color);
        color: white;
      }
    }
  }
</style>
