<script lang="ts">
  import type { TimeUnit } from "../../types.js";
  import type { MemberMappedData } from "../../party-tab.js";
  import { GrantTimeLogic } from "../grant-time-logic.js";

  let { timeUnits, isParty, members, onsubmit }: { 
    timeUnits: TimeUnit[], 
    isParty: boolean, 
    members: MemberMappedData[],
    onsubmit: (timeValues: Record<string, number>, selectedIds: string[]) => void
  } = $props();

  let timeValuesArray = $state(timeUnits.map(tu => ({ id: tu.id, name: tu.name, value: 0 })));
  let selectedIds = $state<string[]>(isParty ? members.map(m => m.id) : []);

  // Exported function to be called by the parent
  export function submit() {
    const values = GrantTimeLogic.prepareSubmitData(timeValuesArray);
    onsubmit(values, $state.snapshot(selectedIds));
  }

  function toggleRecipient(id: string) {
    selectedIds = GrantTimeLogic.toggleRecipient(id, selectedIds);
  }
</script>

<div class="thefehrs-grant-dialog">
  <div class="time-inputs-grid">
    {#each timeValuesArray as timeEntry, i}
      <div class="form-group">
        <label for="time_{timeEntry.id}">{timeEntry.name}s</label>
        <div class="form-fields">
            <input 
              type="number" 
              id="time_{timeEntry.id}" 
              bind:value={timeValuesArray[i].value}
              min="0" 
            />
        </div>
      </div>
    {/each}
  </div>

  {#if isParty}
    <hr />
    <h4 class="section-title">Select Recipients</h4>
    <div class="recipients-list">
      {#each members as member}
        <label class="recipient-row">
          <input type="checkbox" 
                 checked={selectedIds.includes(member.id)} 
                 onchange={() => toggleRecipient(member.id)} />
          <img src={member.tokenImg || member.img || 'modules/thefehrs-learning-manager/mystery-man.svg'} title={member.name} alt={member.name} height="32px" width="40px" />          <span>{member.name}</span>
        </label>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .thefehrs-grant-dialog {
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    .time-inputs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 1rem;
      margin-bottom: 0.5rem;

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 4px;

        label {
          font-weight: bold;
          font-size: 0.85rem;
        }

        input {
          width: 100%;
        }
      }
    }

    .section-title {
      margin: 0.5rem 0;
      border-bottom: 1px solid var(--t5e-faint-color);
      padding-bottom: 4px;
      font-size: 1rem;
    }

    .recipients-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 250px;
      overflow-y: auto;
      padding: 2px;
      border: 1px solid var(--t5e-faint-color);
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.05);
    }

    .recipient-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.1s ease;

      &:hover {
        background: rgba(0, 0, 0, 0.1);
      }

      img {
        object-fit: cover;
        border-radius: 4px;
        border: 1px solid var(--t5e-faint-color);
        background: var(--t5e-background);
      }

      input[type="checkbox"] {
        margin: 0;
      }

      span {
        font-size: 0.9rem;
        font-weight: 500;
      }
    }
  }
</style>
