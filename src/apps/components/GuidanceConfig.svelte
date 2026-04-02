<script lang="ts">
  import type {GuidanceTier, TimeUnit, SystemRules} from "../../types";

  let {guidanceTiers = $bindable(), timeUnits, rules}: {
    guidanceTiers: GuidanceTier[],
    timeUnits: TimeUnit[],
    rules: SystemRules
  } = $props();

  function addTier() {
    const costs: Record<string, number> = {};
    const progress: Record<string, number> = {};
    
    for (const unit of timeUnits) {
      costs[unit.id] = 0;
      progress[unit.id] = 0;
    }

    guidanceTiers = [...guidanceTiers, {
      id: foundry.utils.randomID(),
      name: "New Tier",
      modifier: 0,
      costs,
      progress
    }];
  }

  async function removeTier(id: string, name: string) {
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Tier" },
      content: `<p>Are you sure you want to delete the tier <strong>${name}</strong>?</p>`,
      rejectClose: false,
    });
    if (proceed) {
      guidanceTiers = guidanceTiers.filter(t => t.id !== id);
    }
  }

  function directBulkActive(timeUnit: TimeUnit) {
    return rules.bulkMethod === "direct" && timeUnit.isBulk;
  }
</script>

<section>
    <h3>Guidance Tiers</h3>
    <div class="tier-list">
        {#each guidanceTiers as tier}
            <div class="tier-card">
                <div class="tier-header">
                    <input type="text" bind:value={tier.name} placeholder="Tier Name" class="tier-name-input"
                           aria-label="Tier Name"/>
                    <div class="tier-mod">
                        <label for="tier-mod-{tier.id}">Mod:</label>
                        <input id="tier-mod-{tier.id}" type="number" bind:value={tier.modifier} style="width: 50px;"/>
                    </div>
                    <button type="button" class="tidy-button small danger" onclick={() => removeTier(tier.id, tier.name)}
                            title="Delete Tier">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>

                <div class="tier-grids">
                    <div class="grid-box">
                        <span class="grid-label">Costs (cp)</span>
                        {#each timeUnits as unit}
                            <div class="grid-row">
                                <label for="tier-{tier.id}-cost-{unit.id}">{unit.name}:</label>
                                <input id="tier-{tier.id}-cost-{unit.id}" type="number" bind:value={tier.costs[unit.id]}
                                       min="0"/>
                            </div>
                        {/each}
                    </div>
                    <div class="grid-box">
                        <span class="grid-label">Progress (if bulk)</span>
                        {#each timeUnits as unit}
                            <div class="grid-row">
                                <label for="tier-{tier.id}-progress-{unit.id}"
                                       style={!directBulkActive(unit) ? 'opacity: 0.5' : ''}>{unit.name}:</label>
                                <input
                                        id="tier-{tier.id}-progress-{unit.id}"
                                        type="number"
                                        bind:value={tier.progress[unit.id]}
                                        min="0"
                                        disabled={!directBulkActive(unit)}
                                />
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        {/each}
    </div>
    <button type="button" class="tidy-button" onclick={addTier}>
        <i class="fas fa-plus"></i> Add Tier
    </button>
</section>

<style lang="scss">
  .tier-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .tier-card {
    border: 1px solid var(--t5e-faint-color);
    padding: 0.75rem;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.05);

    .tier-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.75rem;

      .tier-name-input {
        flex: 1;
        font-weight: bold;
      }

      .tier-mod {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
    }

    .tier-grids {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;

      .grid-box {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;

        .grid-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          font-weight: bold;
          opacity: 0.7;
          margin-bottom: 0.25rem;
        }
      }

      .grid-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.85rem;

        input {
          width: 60px;
        }
      }
    }
  }

  button.danger {
    color: var(--t5e-danger-color);

    &:hover {
      background: var(--t5e-danger-color);
      color: white;
    }
  }
</style>
