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

  // Roving tabindex: only the selected tab sits in the page tab order, so
  // `Tab` moves focus in and out of the tablist as a single stop, not
  // through every tab - see https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
  let tabRefs: Record<string, HTMLButtonElement> = {};

  function selectAndFocus(tab: TabDef<TTabId>) {
    activeTab = tab.id;
    tabRefs[tab.id]?.focus();
  }

  // Matches tidy5e-sheet's own tab onKeyDown: ArrowRight/ArrowDown move to
  // the next tab, ArrowLeft/ArrowUp to the previous, both wrapping around;
  // Home/End jump to the first/last tab. Moving focus also selects the tab
  // (automatic activation), same as tidy5e's pattern.
  function onKeyDown(event: KeyboardEvent, index: number) {
    let newIndex: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        newIndex = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        newIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        newIndex = 0;
        break;
      case "End":
        newIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectAndFocus(tabs[newIndex]);
  }
</script>

<!-- A plain div, not <nav>: <nav> is a landmark element and Svelte's own
     a11y linter (rightly) rejects giving a non-interactive landmark an
     interactive role like tablist. -->
<div class="tab-bar" role="tablist">
  {#each tabs as tab, index (tab.id)}
    <button
      type="button"
      class="tab-btn"
      class:active={activeTab === tab.id}
      role="tab"
      id={`tab-${tab.id}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`tabpanel-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      bind:this={tabRefs[tab.id]}
      onclick={() => (activeTab = tab.id)}
      onkeydown={(event) => onKeyDown(event, index)}
    >
      <i class={tab.icon}></i> {tab.label}
    </button>
  {/each}
</div>

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
