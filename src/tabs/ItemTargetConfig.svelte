<script lang="ts">
  import { Settings } from "../settings";
  import type { ProjectRequirement, ComparisonOperator } from "../types";

  let { item } = $props<{ item: any }>();

  let targetValue = $state(0);
  let requirements = $state<ProjectRequirement[]>([]);

  const operatorChoices: Record<ComparisonOperator, string> = {
    "===": "Equal To",
    "!==": "Not Equal To",
    ">": "Greater Than",
    ">=": "Greater Than or Equal To",
    "<": "Less Than",
    "<=": "Less Than or Equal To",
    "includes": "Includes (Array/String)"
  };

  // Initialize from item flags
  $effect(() => {
    const data = item.getFlag(Settings.ID, "projectData") || {};
    targetValue = data.target ?? 0;
    requirements = data.requirements ? JSON.parse(JSON.stringify(data.requirements)) : [];
  });

  async function saveConfig() {
    await item.setFlag(Settings.ID, "projectData", {
      target: targetValue,
      requirements: requirements
    });
    ui.notifications?.info(`Learning configuration updated for ${item.name}`);
  }

  function addRequirement() {
    requirements.push({
      id: foundry.utils.randomID(),
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

  <button type="button" class="save-btn" onclick={saveConfig}>
    <i class="fas fa-save"></i> Save Configuration
  </button>
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

    .save-btn {
      align-self: flex-start;
      padding: 0.5rem 1rem;
      background: var(--t5e-primary-accent-color);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 1rem;

      &:hover {
        filter: brightness(1.1);
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
