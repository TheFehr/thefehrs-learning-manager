<script lang="ts">
  import { onMount } from "svelte";
  import { Settings } from "@/core/settings.js";
  import { MODULE_ID } from "@/global.js";
  import type { Item5e } from "@/types.js";
  import type { PackIndexEntry } from "./mass-edit-logic.js";
  import { loadBooksIndex, loadConfiguredDocuments } from "./mass-edit-logic.js";
  import ItemLearningConfig from "@/apps/tabs/ItemLearningConfig.svelte";
  import AddEntityDialog from "./AddEntityDialog.svelte";

  let loading = $state(true);
  let docs = $state<Item5e[]>([]);
  let allEntries = $state<PackIndexEntry[]>([]);
  let expandedId = $state<string | null>(null);
  let showAddDialog = $state(false);

  const bookCompendiums = Settings.get("bookCompendiums");

  onMount(async () => {
    try {
      const entries = await loadBooksIndex();
      allEntries = entries;
      docs = await loadConfiguredDocuments<Item5e>(entries);
    } catch (e) {
      console.error("[BooksTab] Failed to load books:", e);
    } finally {
      loading = false;
    }
  });

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function getBookSummary(item: Item5e): { modifier: number; categoryCount: number } {
    const data = item.getFlag(MODULE_ID, "learningBookBonus") as { modifier?: number; categories?: string[] } | undefined;
    return {
      modifier: data?.modifier ?? 0,
      categoryCount: data?.categories?.length ?? 0,
    };
  }

  function handleAdded(doc: any) {
    docs = [...docs, doc as Item5e];
    showAddDialog = false;
    expandedId = (doc as any).id;
  }
</script>

<div class="mass-edit-tab books-tab">
  <div class="tab-toolbar">
    <button
      type="button"
      class="tidy-button small"
      onclick={() => { showAddDialog = !showAddDialog; }}
    >
      <i class="fas fa-plus"></i> Add / Create Book
    </button>
  </div>

  {#if showAddDialog}
    <AddEntityDialog
      packIds={bookCompendiums}
      docType="Item"
      {allEntries}
      onAdded={handleAdded}
      onDismiss={() => (showAddDialog = false)}
    />
  {/if}

  {#if loading}
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin"></i> Loading books...
    </div>
  {:else if docs.length === 0}
    <p class="empty-state">No configured books found. Use "Add / Create Book" to get started.</p>
  {:else}
    <div class="entity-list">
      {#each docs as item (item.id)}
        {@const summary = getBookSummary(item)}
        <div class="entity-card" class:expanded={expandedId === item.id}>
          <button
            type="button"
            class="card-header"
            onclick={() => toggleExpand(item.id!)}
            aria-expanded={expandedId === item.id}
          >
            <span class="card-name">{item.name}</span>
            <span class="card-badges">
              {#if summary.modifier !== 0}
                <span class="badge" title="Modifier">
                  <i class="fas fa-plus-minus"></i> {summary.modifier > 0 ? "+" : ""}{summary.modifier}
                </span>
              {/if}
              {#if summary.categoryCount > 0}
                <span class="badge" title="Categories">
                  <i class="fas fa-tags"></i> {summary.categoryCount}
                </span>
              {/if}
            </span>
            <i class="fas fa-chevron-down expand-icon"></i>
          </button>

          {#if expandedId === item.id}
            <div class="card-body">
              <ItemLearningConfig {item} />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .mass-edit-tab {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .tab-toolbar {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .loading-state, .empty-state {
    text-align: center;
    color: var(--t5e-secondary-color, #888);
    padding: 2rem 1rem;
    font-style: italic;
  }

  .entity-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .entity-card {
    border: 1px solid var(--t5e-faint-color, #ccc);
    border-radius: 4px;
    overflow: hidden;

    &.expanded {
      border-color: var(--t5e-primary-color, #4a90d9);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      color: inherit;

      &:hover {
        background: rgba(0, 0, 0, 0.05);
      }

      .card-name {
        flex: 1;
        font-weight: bold;
      }

      .card-badges {
        display: flex;
        gap: 0.4rem;

        .badge {
          font-size: 0.75rem;
          padding: 0.15rem 0.4rem;
          border-radius: 3px;
          background: var(--t5e-faint-color, #e8e8e8);
          color: var(--t5e-secondary-color, #555);
        }
      }

      .expand-icon {
        transition: transform 0.2s;
        color: var(--t5e-secondary-color, #888);
      }
    }

    &.expanded .card-header .expand-icon {
      transform: rotate(180deg);
    }

    .card-body {
      border-top: 1px solid var(--t5e-faint-color, #ccc);
    }
  }
</style>
