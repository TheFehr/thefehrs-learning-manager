<script lang="ts" generics="TTabId extends string">
  export interface TabDef<TTabId extends string> {
    id: TTabId;
    label: string;
    icon: string;
  }

  let { tabs, activeTab = $bindable() } = $props<{
    tabs: TabDef<TTabId>[];
    activeTab: TTabId;
  }>();
</script>

<nav class="tab-bar">
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      class="tab-btn"
      class:active={activeTab === tab.id}
      onclick={() => (activeTab = tab.id)}
    >
      <i class={tab.icon}></i> {tab.label}
    </button>
  {/each}
</nav>

<style lang="scss">
  .tab-bar {
    display: flex;
    border-bottom: 2px solid var(--t5e-faint-color, #ccc);
    flex-shrink: 0;
    gap: 0;

    .tab-btn {
      padding: 0.5rem 1.25rem;
      border: none;
      border-bottom: 2px solid transparent;
      background: none;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.9rem;
      color: var(--t5e-secondary-color, #666);
      margin-bottom: -2px;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      transition: color 0.15s;

      &:hover {
        color: var(--t5e-primary-color, #4a90d9);
      }

      &.active {
        color: var(--t5e-primary-color, #4a90d9);
        border-bottom-color: var(--t5e-primary-color, #4a90d9);
        font-weight: bold;
      }
    }
  }
</style>
