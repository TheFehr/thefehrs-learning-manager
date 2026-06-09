<script lang="ts">
  import type { PackIndexEntry } from "./mass-edit-logic.js";
  import {
    activateDocument,
    createAndActivateDocument,
    getAvailableDestinations,
  } from "./mass-edit-logic.js";
  import type { Item5e, Actor5e } from "@/types.js";

  let {
    packIds,
    docType,
    defaultItemType,
    allEntries,
    onAdded,
    onDismiss,
  } = $props<{
    packIds: string[];
    docType: "Item" | "Actor";
    defaultItemType?: string;
    allEntries: PackIndexEntry[];
    onAdded: (doc: Item5e | Actor5e) => void;
    onDismiss: () => void;
  }>();

  let mode = $state<"search" | "create">("search");
  let searchQuery = $state("");
  let newName = $state("");
  let newDestination = $state("");
  let isWorking = $state(false);
  let errorMessage = $state<string | null>(null);

  const destinations = $derived(getAvailableDestinations(packIds));

  const unconfigured = $derived(
    allEntries.filter((e) => !e.learningModeEnabled),
  );

  const filteredEntries = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return unconfigured;
    return unconfigured.filter((e) => e.name.toLowerCase().includes(q));
  });

  $effect(() => {
    if (destinations.length > 0 && !newDestination) {
      newDestination = destinations[0].id;
    }
  });

  async function handleActivate(entry: PackIndexEntry) {
    isWorking = true;
    errorMessage = null;
    const doc = await activateDocument(entry);
    isWorking = false;
    if (doc) {
      onAdded(doc);
    } else {
      errorMessage = `Failed to activate "${entry.name}".`;
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      errorMessage = "Please enter a name.";
      return;
    }
    isWorking = true;
    errorMessage = null;
    const doc = await createAndActivateDocument(docType, name, defaultItemType, newDestination);
    isWorking = false;
    if (doc) {
      onAdded(doc);
    } else {
      errorMessage = `Failed to create "${name}".`;
    }
  }
</script>

<div class="add-entity-dialog">
  <div class="dialog-header">
    <div class="dialog-tabs">
      <button
        type="button"
        class="tidy-button small"
        class:active={mode === "search"}
        onclick={() => { mode = "search"; errorMessage = null; }}
      >
        <i class="fas fa-search"></i> Search Existing
      </button>
      <button
        type="button"
        class="tidy-button small"
        class:active={mode === "create"}
        onclick={() => { mode = "create"; errorMessage = null; }}
      >
        <i class="fas fa-plus"></i> Create New
      </button>
    </div>
    <button
      type="button"
      class="tidy-button small dismiss-btn"
      onclick={onDismiss}
      aria-label="Close"
    >
      <i class="fas fa-times"></i>
    </button>
  </div>

  {#if errorMessage}
    <p class="error-message">{errorMessage}</p>
  {/if}

  {#if mode === "search"}
    <div class="search-mode">
      <input
        type="text"
        placeholder="Filter by name..."
        bind:value={searchQuery}
        oninput={(e) => e.stopPropagation()}
      />
      <div class="search-results">
        {#if filteredEntries.length === 0}
          <p class="empty-note">
            {searchQuery ? "No matches found." : "All entries are already configured."}
          </p>
        {:else}
          {#each filteredEntries as entry (entry.uuid)}
            <button
              type="button"
              class="result-row tidy-button small"
              disabled={isWorking}
              onclick={() => handleActivate(entry)}
            >
              <span class="result-name">{entry.name}</span>
              {#if entry.packId}
                <span class="result-pack">{entry.packId.split(".").pop()}</span>
              {:else}
                <span class="result-pack">World</span>
              {/if}
              <i class="fas fa-plus-circle result-icon"></i>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {:else}
    <div class="create-mode">
      <div class="form-row">
        <label for="new-name">Name</label>
        <input
          id="new-name"
          type="text"
          placeholder="Enter a name..."
          bind:value={newName}
          oninput={(e) => e.stopPropagation()}
        />
      </div>
      <div class="form-row">
        <label for="new-destination">Save to</label>
        <select id="new-destination" bind:value={newDestination} onchange={(e) => e.stopPropagation()}>
          {#each destinations as dest (dest.id)}
            <option value={dest.id}>{dest.label}</option>
          {/each}
        </select>
      </div>
      {#if destinations.length === 1}
        <p class="empty-note">No writable compendiums available. Unlock a compendium or use "World".</p>
      {/if}
      <button
        type="button"
        class="tidy-button primary"
        disabled={isWorking || !newName.trim()}
        onclick={handleCreate}
      >
        {#if isWorking}
          <i class="fas fa-spinner fa-spin"></i> Creating...
        {:else}
          <i class="fas fa-plus"></i> Create
        {/if}
      </button>
    </div>
  {/if}
</div>

<style lang="scss">
  .add-entity-dialog {
    background: var(--t5e-background, #f0f0e0);
    border: 1px solid var(--t5e-faint-color, #ccc);
    border-radius: 4px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .dialog-tabs {
        display: flex;
        gap: 0.25rem;
        flex: 1;

        .tidy-button.active {
          background: var(--t5e-primary-color, #4a90d9);
          color: white;
          border-color: var(--t5e-primary-color, #4a90d9);
        }
      }

      .dismiss-btn {
        color: var(--t5e-secondary-color, #888);
      }
    }

    .error-message {
      color: var(--t5e-danger-color, #c00);
      font-size: 0.85rem;
      margin: 0;
    }

    .search-mode {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      input { width: 100%; }

      .search-results {
        max-height: 180px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;

        .empty-note {
          font-size: 0.85rem;
          color: var(--t5e-secondary-color, #888);
          text-align: center;
          margin: 0.5rem 0;
        }

        .result-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          text-align: left;
          padding: 0.3rem 0.5rem;

          .result-name { flex: 1; }
          .result-pack {
            font-size: 0.75rem;
            color: var(--t5e-secondary-color, #888);
          }
          .result-icon { color: var(--t5e-primary-color, #4a90d9); }

          &:hover .result-icon { color: white; }
        }
      }
    }

    .create-mode {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .form-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        label {
          font-weight: bold;
          min-width: 70px;
          font-size: 0.9rem;
        }
        input, select { flex: 1; }
      }

      .empty-note {
        font-size: 0.85rem;
        color: var(--t5e-secondary-color, #888);
        margin: 0;
      }
    }
  }
</style>
