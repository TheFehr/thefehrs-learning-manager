<script lang="ts">
  import type { TimeUnit } from "../../types.js";
  import type { MemberMappedData } from "../../party-tab.js";

  let { timeUnits, isParty, members }: { timeUnits: TimeUnit[], isParty: boolean, members: MemberMappedData[] } = $props();
</script>

<form class="thefehrs-grant-dialog">
  <div class="time-inputs-grid">
    {#each timeUnits as tu}
      <div class="form-group">
        <label for="time_{tu.id}">{tu.name}s</label>
        <input type="number" id="time_{tu.id}" name="time_{tu.id}" value="0" />
      </div>
    {/each}
  </div>

  {#if isParty}
    <hr />
    <h4 class="section-title">Select Recipients</h4>
    <div class="recipients-list">
      {#each members as m}
        <label class="recipient-row">
          <input type="checkbox" name="actor_{m.id}" checked />
          <img src={m.img} title={m.name} alt={m.name} height="50px" width="50px" />
          <span>{m.name}</span>
        </label>
      {/each}
    </div>
  {/if}
</form>

<style lang="scss">
  .thefehrs-grant-dialog {
    .time-inputs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;
      margin-bottom: 15px;

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 4px;

        label {
          font-weight: bold;
        }

        input {
          width: 100%;
        }
      }
    }

    .section-title {
      margin: 10px 0;
      border-bottom: 1px solid var(--t5e-faint-color);
      padding-bottom: 5px;
    }

    .recipients-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-height: 300px;
      overflow-y: auto;
      padding: 5px;
    }

    .recipient-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 5px;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        background: rgba(0, 0, 0, 0.05);
      }

      img {
        object-fit: cover;
        border-radius: 4px;
        border: 1px solid var(--t5e-faint-color);
      }

      input[type="checkbox"] {
        margin: 0;
      }
    }
  }
</style>
