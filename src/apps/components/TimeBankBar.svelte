<script lang="ts">
  import { Settings } from "../../core/settings.js";
  import { ActorProxy } from "../../actor-proxy.js";
  import type { Actor5e, TimeUnit } from "../../types.js";
  import { TimeBankLogic } from "../time-bank-logic.js";

  let { actor }: { actor: Actor5e } = $props();

  let proxy = $derived(ActorProxy.forActor(actor));
  let bank = $derived(proxy.bank);
  let sortedUnits = $derived([...Settings.timeUnits].sort((a, b) => b.ratio - a.ratio));

  function getTimeValue(unit: TimeUnit, total: number) {
    return TimeBankLogic.getTimeValue(unit, total, sortedUnits);
  }

  async function updateTime(unit: TimeUnit, newValue: string) {
    await TimeBankLogic.updateTime(unit, newValue, proxy, bank.total, sortedUnits);
  }
</script>

<div class="sheet-footer flexrow inventory-footer time-bank-footer">
  <div class="footer-content-left flexrow flexshrink">
    <div class="time-bank-label pill pill-medium">
      <i class="fas fa-piggy-bank highlighted"></i>
      <span class="font-label-medium color-text-lighter">Time Bank</span>
    </div>
  </div>

  <div class="currency-container flexrow flex1">
    {#each sortedUnits as unit}
      <label class="input-group">
        <i class="time-unit-icon {unit.id}" aria-label={unit.name} title={unit.name}>
            {unit.short.toUpperCase()}
        </i>
        <input 
          type="number" 
          class="currency-item uninput" 
          value={getTimeValue(unit, bank.total)}
          onchange={(e) => updateTime(unit, e.currentTarget.value)}
          placeholder="0"
          min="0"
          step="1"
        />
        <span class="denomination">{unit.short}</span>
      </label>
    {/each}
  </div>

  <div class="footer-content-right flexrow flexshrink">
    <div class="total-time pill pill-medium" title="Total Base Units">
        <span class="value font-data-medium">{bank.total}</span>
        <span class="font-label-medium color-text-lighter">total</span>
    </div>
  </div>
</div>

<style lang="scss">
  .time-bank-footer {
    border-top: 1px solid var(--t5e-faint-color);
    padding: 0.5rem 1rem;
    background: var(--t5e-header-background);
    position: sticky;
    bottom: 0;
    z-index: 1;

    .time-bank-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: var(--t5e-faint-color);
        padding: 0 0.75rem;
        height: 2rem;
    }

    .time-unit-icon {
        font-style: normal;
        font-weight: bold;
        font-size: 0.75rem;
        width: 1.25rem;
        height: 1.25rem;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--t5e-tertiary-color);
        color: var(--t5e-color-inverse);
        border-radius: 50%;
    }

    .currency-container {
        gap: 0.5rem;
        padding: 0 1rem;
    }

    .input-group {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        background: var(--t5e-faint-color);
        padding: 0 0.5rem;
        border-radius: 4px;
        flex: 1;

        input {
            text-align: right;
            width: 100%;
            border: none;
            background: transparent;
            font-family: var(--t5e-font-family);
            font-size: 0.85rem;
            color: var(--t5e-primary-color);

            &:focus {
                box-shadow: none;
            }
        }

        .denomination {
            font-size: 0.7rem;
            text-transform: uppercase;
            opacity: 0.6;
            font-weight: bold;
        }
    }

    .total-time {
        background: var(--t5e-faint-color);
        padding: 0 0.75rem;
        height: 2rem;
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
  }
</style>
