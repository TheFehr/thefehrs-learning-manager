<script lang="ts">
  import { onMount } from "svelte";
  import type { Item5e } from "@/types.js";
  import { Settings } from "@/core/settings.js";
  import { Logger } from "@/core/logger.js";

  let { parentItem, onSelect, onClose } = $props<{
    parentItem: Item5e | null;
    onSelect: (childUuid: string) => void;
    onClose: () => void;
  }>();

  let searchQuery = $state("");
  let allItems = $state<Item5e[]>([]);
  let isLoading = $state(true);

  const filteredItems = $derived.by(() => {
    const baseItems = allItems.filter(item => item.uuid !== parentItem?.uuid);
    if (!searchQuery) return baseItems.slice(0, 20);
    const query = searchQuery.toLowerCase();
    return baseItems
      .filter(item => item.name?.toLowerCase().includes(query))
      .slice(0, 20);
  });

  async function loadAllProjects() {
    try {
      isLoading = true;
      const allowed = Settings.get("allowedCompendiums");
      const docs: Item5e[] = [];

      for (const packId of allowed) {
        try {
          const pack = (game as unknown as { packs: { get: (id: string) => any } }).packs.get(packId);
          if (!pack) continue;
          const packDocs = await pack.getDocuments();
          docs.push(...(packDocs as Item5e[]));
        } catch (err) {
          Logger.error(`Failed to load pack ${packId}:`, false, err);
        }
      }
      
      allItems = docs;
    } catch (err) {
      Logger.error("Failed to load all projects:", true, err);
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadAllProjects();
  });
</script>

<div class="follow-up-picker thefehrs-learning-manager">
  <div class="search-header">
    <i class="fas fa-search"></i>
    <input 
      type="text" 
      placeholder={parentItem ? `Search for a project to follow ${parentItem.name}...` : "Search for a project to add to the tree..."} 
      bind:value={searchQuery}
      autofocus
    />
  </div>

  <div class="results-list">
    {#if isLoading}
        <div class="message"><i class="fas fa-spinner fa-spin"></i> Loading projects...</div>
    {:else if filteredItems.length === 0}
        <div class="message">No matching projects found.</div>
    {:else}
        {#each filteredItems as item}
            <button 
                type="button" 
                class="result-item" 
                onclick={() => onSelect(item.uuid)}
            >
                <img src={item.img} alt="" />
                <div class="details">
                    <span class="name">{item.name}</span>
                    <span class="pack">{(item as unknown as { pack?: string }).pack ?? "World"}</span>
                </div>
                <i class="fas fa-plus"></i>
            </button>
        {/each}
    {/if}
  </div>
  
  <footer class="picker-footer">
      <button type="button" class="tidy-button" onclick={onClose}>Cancel</button>
  </footer>
</div>

<style lang="scss">
  .follow-up-picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 300px;
  }

  .search-header {
    position: relative;
    display: flex;
    align-items: center;

    i {
        position: absolute;
        left: 10px;
        color: var(--color-text-light-7);
    }

    input {
        width: 100%;
        padding: 8px 12px 8px 32px;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid var(--color-border-dark-1);
        border-radius: 4px;
        color: var(--color-text-light-2);
    }
  }

  .results-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--color-border-dark-2);
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;

    .message {
        padding: 20px;
        text-align: center;
        color: var(--color-text-light-7);
    }

    .result-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid transparent;
        border-radius: 4px;
        cursor: pointer;
        text-align: left;
        width: 100%;
        color: inherit;
        transition: all 0.15s ease;

        &:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: var(--color-level-info);
        }

        img {
            width: 32px;
            height: 32px;
            border-radius: 2px;
        }

        .details {
            flex: 1;
            display: flex;
            flex-direction: column;

            .name { font-weight: bold; }
            .pack { font-size: 0.75rem; color: var(--color-text-light-7); }
        }

        i {
            opacity: 0;
            color: var(--color-level-success);
        }

        &:hover i {
            opacity: 1;
        }
    }
  }

  .picker-footer {
      display: flex;
      justify-content: flex-end;
  }
</style>
