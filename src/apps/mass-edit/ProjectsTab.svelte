<script lang="ts">
  import { onMount } from "svelte";
  import { Settings } from "@/core/settings.js";
  import { MODULE_ID } from "@/global.js";
  import type { Item5e } from "@/types.js";
  import type { PackIndexEntry } from "./mass-edit-logic.js";
  import { loadProjectsIndex, loadConfiguredDocuments } from "./mass-edit-logic.js";
  import ItemLearningConfig from "@/apps/tabs/ItemLearningConfig.svelte";
  import AddEntityDialog from "./AddEntityDialog.svelte";

  let loading = $state(true);
  let docs = $state<Item5e[]>([]);
  let allEntries = $state<PackIndexEntry[]>([]);
  let expandedId = $state<string | null>(null);
  let showAddDialog = $state(false);

  const allowedCompendiums = Settings.get("allowedCompendiums");

  onMount(async () => {
    try {
      const entries = await loadProjectsIndex();
      allEntries = entries;
      docs = await loadConfiguredDocuments<Item5e>(entries);
    } catch (e) {
      console.error("[ProjectsTab] Failed to load projects:", e);
    } finally {
      loading = false;
    }
  });

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function getProjectSummary(item: Item5e): { target: number; categoryCount: number; followUpId: string } {
    const data = item.getFlag(MODULE_ID, "projectData") as { target?: number; categories?: string[]; followUpProjectId?: string } | undefined;
    return {
      target: data?.target ?? 0,
      categoryCount: data?.categories?.length ?? 0,
      followUpId: data?.followUpProjectId ?? "",
    };
  }

  function getFollowUpName(uuid: string): string {
    if (!uuid) return "";
    const entry = allEntries.find((e) => e.uuid === uuid);
    return entry?.name ?? uuid;
  }

  async function handleFollowUpChange(item: Item5e, newUuid: string) {
    await item.update(
      { [`flags.${MODULE_ID}.projectData.followUpProjectId`]: newUuid },
      { render: false } as any,
    );
  }

  function handleAdded(doc: any) {
    docs = [...docs, doc as Item5e];
    showAddDialog = false;
    expandedId = (doc as any).id;
  }
</script>

<div class="mass-edit-tab projects-tab">
  <div class="tab-toolbar">
    <button
      type="button"
      class="tidy-button small"
      onclick={() => { showAddDialog = !showAddDialog; }}
    >
      <i class="fas fa-plus"></i> Add / Create Project
    </button>
  </div>

  {#if showAddDialog}
    <AddEntityDialog
      packIds={allowedCompendiums}
      docType="Item"
      defaultItemType="feat"
      {allEntries}
      onAdded={handleAdded}
      onDismiss={() => (showAddDialog = false)}
    />
  {/if}

  {#if loading}
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin"></i> Loading projects...
    </div>
  {:else if docs.length === 0}
    <p class="empty-state">No configured projects found. Use "Add / Create Project" to get started.</p>
  {:else}
    <div class="entity-list">
      {#each docs as item (item.id)}
        {@const summary = getProjectSummary(item)}
        <div class="entity-card" class:expanded={expandedId === item.id}>
          <button
            type="button"
            class="card-header"
            onclick={() => toggleExpand(item.id!)}
            aria-expanded={expandedId === item.id}
          >
            <span class="card-name">{item.name}</span>
            <span class="card-badges">
              {#if summary.target > 0}
                <span class="badge" title="Target">
                  <i class="fas fa-bullseye"></i> {summary.target}
                </span>
              {/if}
              {#if summary.categoryCount > 0}
                <span class="badge" title="Categories">
                  <i class="fas fa-tags"></i> {summary.categoryCount}
                </span>
              {/if}
              {#if summary.followUpId}
                <span class="badge follow-up" title="Has follow-up: {getFollowUpName(summary.followUpId)}">
                  <i class="fas fa-arrow-right"></i>
                </span>
              {/if}
            </span>
            <i class="fas fa-chevron-down expand-icon"></i>
          </button>

          {#if expandedId === item.id}
            <div class="card-body">
              <ItemLearningConfig {item} />

              <div class="follow-up-section">
                <h5>Follow-up Project</h5>
                <p class="notes">The project that becomes available after this one is completed.</p>
                <select
                  value={summary.followUpId}
                  onchange={(e) => handleFollowUpChange(item, e.currentTarget.value)}
                >
                  <option value="">(None)</option>
                  {#each allEntries.filter((e) => e.uuid !== item.uuid) as entry (entry.uuid)}
                    <option value={entry.uuid}>{entry.name}</option>
                  {/each}
                </select>
              </div>
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

          &.follow-up {
            background: var(--t5e-primary-color, #4a90d9);
            color: white;
          }
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

    .follow-up-section {
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--t5e-faint-color, #ccc);
      display: flex;
      flex-direction: column;
      gap: 0.4rem;

      h5 {
        margin: 0;
        font-size: 0.95rem;
      }

      .notes {
        font-size: 0.85rem;
        color: var(--t5e-secondary-color, #888);
        margin: 0;
      }

      select { width: 100%; }
    }
  }
</style>
