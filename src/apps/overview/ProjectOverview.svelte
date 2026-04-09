<script lang="ts">
  import { onMount } from "svelte";
  import { getInvalidProjects, type InvalidProjectReason } from "../overview-logic.js";

  let invalidProjects = $state<InvalidProjectReason[]>([]);
  let isLoading = $state(true);
  let errorMessage = $state<string | null>(null);

  onMount(async () => {
    try {
      invalidProjects = await getInvalidProjects();
    } catch (error) {
      console.error("Downtime Engine | Error fetching invalid projects:", error);
      errorMessage = "Failed to load invalid projects. Check console for details.";
    } finally {
      isLoading = false;
    }
  });

  function openItemSheet(item: any) {
    if (!item?.sheet) {
      console.warn("Downtime Engine | Cannot open sheet: item or sheet is undefined");
      return;
    }
    item.sheet.render(true);
  }
</script>

<div class="project-overview-container">
  {#if isLoading}
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin"></i> Loading invalid projects...
    </div>
  {:else if errorMessage}
    <div class="error-state">
      <i class="fas fa-exclamation-triangle"></i> {errorMessage}
    </div>
  {:else if invalidProjects.length === 0}
    <div class="no-invalid-projects">
      <p>All projects are valid!</p>
    </div>
  {:else}
    <div class="invalid-projects-list">
      {#each invalidProjects as { item, packName, reasons }}
        <div class="invalid-project-card">
          <div class="project-info">
            <div
              class="project-name"
              onclick={() => openItemSheet(item)}
              role="button"
              tabindex="0"
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openItemSheet(item);
                }
              }}
            >
              {item.name}
            </div>
            <div class="pack-name">
              <i class="fas fa-archive"></i> {packName}
            </div>
          </div>
          <ul class="reasons-list">
            {#each reasons as reason}
              <li class="reason-item text-error">{reason}</li>
            {/each}
          </ul>
          <div class="actions">
            <button
              type="button"
              class="tidy-button"
              onclick={() => openItemSheet(item)}
              title="Open Item Sheet"
            >
              <i class="fas fa-edit"></i> Fix Project
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .project-overview-container {
    padding: 0.5rem;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .loading-state,
  .no-invalid-projects,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
    font-size: 1.1rem;
    gap: 0.5rem;
    opacity: 0.7;
  }

  .error-state {
    color: var(--t5e-prepared-color, #d61c1c);
  }

  .invalid-projects-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .invalid-project-card {
    border: 1px solid var(--t5e-faint-color, #ccc);
    border-radius: 0.25rem;
    padding: 0.75rem;
    background: var(--t5e-background, rgba(0, 0, 0, 0.05));
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .project-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .project-name {
    margin: 0;
    cursor: pointer;
    color: var(--t5e-primary-accent-color, #ff6400);
    font-size: 1rem;
    font-weight: bold;
  }

  .project-name:hover {
    text-decoration: underline;
  }

  .pack-name {
    font-size: 0.75rem;
    color: var(--t5e-secondary-color, #666);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .reasons-list {
    margin: 0.25rem 0;
    padding-left: 1.25rem;
  }

  .reason-item {
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  .text-error {
    color: var(--t5e-prepared-color, #d61c1c);
  }

  button.tidy-button {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
  }
</style>
