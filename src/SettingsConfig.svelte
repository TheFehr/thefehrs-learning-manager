<script lang="ts">
  import { Settings } from "./settings";
  import type { SystemRules, TimeUnit, GuidanceTier } from "./types";

  // State
  let rules = $state<SystemRules>(Settings.rules);
  let timeUnits = $state<TimeUnit[]>(Settings.timeUnits);
  let guidanceTiers = $state<GuidanceTier[]>(Settings.guidanceTiers);
  let allowedCompendiums = $state<string[]>(Settings.allowedCompendiums);

  // Computed / Constant
  const availablePacks = (game.packs as any)
    .filter((p: any) => p.metadata.type === "Item")
    .map((p: any) => ({
      id: p.metadata.id,
      label: p.metadata.label
    }));

  async function save() {
    await Settings.setRules(rules);
    await Settings.setTimeUnits(timeUnits);
    await Settings.setGuidanceTiers(guidanceTiers);
    await Settings.setAllowedCompendiums(allowedCompendiums);
    ui.notifications?.info("Downtime Engine | Settings saved successfully.");
  }

  function addTimeUnit() {
    timeUnits.push({
      id: foundry.utils.randomID(),
      name: "New Unit",
      short: "u",
      isBulk: false,
      ratio: 1
    });
  }

  function removeTimeUnit(id: string) {
    timeUnits = timeUnits.filter(u => u.id !== id);
  }

  function addTier() {
    guidanceTiers.push({
      id: foundry.utils.randomID(),
      name: "New Tier",
      modifier: 0,
      costs: {},
      progress: {}
    });
  }

  function removeTier(id: string) {
    guidanceTiers = guidanceTiers.filter(t => t.id !== id);
  }

  function exportSettings() {
    const data = {
      rules,
      timeUnits,
      guidanceTiers,
      allowedCompendiums
    };
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", "downtime-engine-settings.json");
  }

  function importSettings() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event: any) => {
        try {
          const data = JSON.parse(event.target.result);
          if (data.rules) rules = data.rules;
          if (data.timeUnits) timeUnits = data.timeUnits;
          if (data.guidanceTiers) guidanceTiers = data.guidanceTiers;
          if (data.allowedCompendiums) allowedCompendiums = data.allowedCompendiums;
          ui.notifications?.info("Downtime Engine | Settings imported. Click Save to persist.");
        } catch (err: any) {
          ui.notifications?.error("Failed to import settings: " + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function toggleCompendium(id: string) {
    if (allowedCompendiums.includes(id)) {
      allowedCompendiums = allowedCompendiums.filter(c => c !== id);
    } else {
      allowedCompendiums = [...allowedCompendiums, id];
    }
  }
</script>

<div class="thefehrs-settings svelte-settings">
  <div class="header-actions">
    <button type="button" class="tidy-button" onclick={exportSettings} title="Export Settings">
      <i class="fas fa-file-export"></i> Export
    </button>
    <button type="button" class="tidy-button" onclick={importSettings} title="Import Settings">
      <i class="fas fa-file-import"></i> Import
    </button>
  </div>

  <section>
    <h3>Global Rules</h3>
    <div class="form-group">
      <label for="rule-method">Method</label>
      <select id="rule-method" bind:value={rules.method}>
        <option value="direct">1 Base Unit = 1 Progress</option>
        <option value="roll">Learning Check</option>
      </select>
    </div>

    {#if rules.method === 'roll'}
      <div class="form-group">
        <label for="rule-dc">Check DC</label>
        <input id="rule-dc" type="number" bind:value={rules.checkDC} />
      </div>
      <div class="form-group">
        <label for="rule-formula">Formula</label>
        <input id="rule-formula" type="text" bind:value={rules.checkFormula} placeholder="1d20 + @attributes.int.mod + @tutelage" />
      </div>
      <div class="form-group">
        <label for="rule-crit">Crit Strategy</label>
        <select id="rule-crit" bind:value={rules.critDoubleStrategy}>
          <option value="never">Never double</option>
          <option value="any">Double if any die >= threshold</option>
          <option value="all">Double if all dice >= threshold</option>
        </select>
      </div>
      <div class="form-group">
        <label for="rule-threshold">Crit Threshold</label>
        <input id="rule-threshold" type="number" bind:value={rules.critThreshold} min="1" max="20" />
      </div>
    {/if}
  </section>

  <hr />

  <section>
    <h3>Allowed Compendiums</h3>
    <p class="notes">Items dropped from these compendiums can start projects.</p>
    <div class="compendium-list">
      {#each availablePacks as pack}
        <label class="compendium-item">
          <input type="checkbox" checked={allowedCompendiums.includes(pack.id)} onchange={() => toggleCompendium(pack.id)} />
          <span>{pack.label} <small>[{pack.id}]</small></span>
        </label>
      {/each}
    </div>
  </section>

  <hr />

  <section>
    <h3>Time Units</h3>
    <table class="tidy-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Short</th>
          <th title="Bulk units use defined progress instead of 1">Bulk?</th>
          <th title="Ratio to base unit (e.g. Day = 10 Hours)">Ratio</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each timeUnits as unit}
          <tr>
            <td><input type="text" bind:value={unit.name} aria-label="Unit Name" /></td>
            <td><input type="text" bind:value={unit.short} style="width: 40px;" aria-label="Unit Short Name" /></td>
            <td style="text-align: center;"><input type="checkbox" bind:checked={unit.isBulk} aria-label="Is Bulk?" /></td>
            <td><input type="number" bind:value={unit.ratio} min="1" style="width: 60px;" aria-label="Ratio" /></td>
            <td>
              <button type="button" class="tidy-button small danger" onclick={() => removeTimeUnit(unit.id)} title="Delete Time Unit">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button type="button" class="tidy-button" onclick={addTimeUnit}>
      <i class="fas fa-plus"></i> Add Unit
    </button>
  </section>

  <hr />

  <section>
    <h3>Guidance Tiers</h3>
    <div class="tier-list">
      {#each guidanceTiers as tier}
        <div class="tier-card">
          <div class="tier-header">
            <input type="text" bind:value={tier.name} placeholder="Tier Name" class="tier-name-input" aria-label="Tier Name" />
            <div class="tier-mod">
              <label for="tier-mod-{tier.id}">Mod:</label>
              <input id="tier-mod-{tier.id}" type="number" bind:value={tier.modifier} style="width: 50px;" />
            </div>
            <button type="button" class="tidy-button small danger" onclick={() => removeTier(tier.id)} title="Delete Tier">
              <i class="fas fa-trash"></i>
            </button>
          </div>
          
          <div class="tier-grids">
            <div class="grid-box">
              <span class="grid-label">Costs (cp)</span>
              {#each timeUnits as unit}
                <div class="grid-row">
                  <label for="tier-{tier.id}-cost-{unit.id}">{unit.name}:</label>
                  <input id="tier-{tier.id}-cost-{unit.id}" type="number" bind:value={tier.costs[unit.id]} min="0" />
                </div>
              {/each}
            </div>
            <div class="grid-box">
              <span class="grid-label">Progress (if bulk)</span>
              {#each timeUnits as unit}
                <div class="grid-row">
                  <label for="tier-{tier.id}-progress-{unit.id}" style={!unit.isBulk ? 'opacity: 0.5' : ''}>{unit.name}:</label>
                  <input
                    id="tier-{tier.id}-progress-{unit.id}"
                    type="number"
                    bind:value={tier.progress[unit.id]}
                    min="0"
                    disabled={!unit.isBulk}
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
    gap: 1rem;
    padding: 1rem;
    height: 100%;
    overflow-y: auto;

    h3 {
      margin-top: 0;
      border-bottom: 1px solid var(--t5e-faint-color);
      padding-bottom: 0.25rem;
    }

    .header-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    .form-group {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.5rem;

      label {
        flex: 0 0 150px;
        font-weight: bold;
      }

      input, select {
        flex: 1;
      }
    }

    .notes {
      font-size: 0.8rem;
      color: var(--t5e-secondary-color);
      font-style: italic;
    }

    .compendium-list {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
      max-height: 150px;
      overflow-y: auto;
      border: 1px solid var(--t5e-faint-color);
      padding: 0.5rem;
      border-radius: 4px;

      .compendium-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;

        span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        small {
          opacity: 0.6;
        }
      }
    }

    .tier-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .tier-card {
      border: 1px solid var(--t5e-faint-color);
      padding: 0.75rem;
      border-radius: 4px;
      background: rgba(0,0,0,0.05);

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

    .footer-actions {
      position: sticky;
      bottom: -1rem;
      background: var(--t5e-background);
      padding: 1rem 0;
      border-top: 1px solid var(--t5e-faint-color);
      display: flex;
      justify-content: center;
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
