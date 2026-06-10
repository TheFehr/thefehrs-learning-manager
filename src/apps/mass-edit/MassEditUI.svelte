<script lang="ts">
  import ProjectsTab from "./ProjectsTab.svelte";
  import TeachersTab from "./TeachersTab.svelte";
  import BooksTab from "./BooksTab.svelte";

  let activeTab = $state<"projects" | "teachers" | "books">("projects");
</script>

<div class="thefehrs-mass-edit">
  <nav class="mass-edit-tabs">
    <button
      type="button"
      class="tab-btn"
      class:active={activeTab === "projects"}
      onclick={() => (activeTab = "projects")}
    >
      <i class="fas fa-book-open"></i> Projects
    </button>
    <button
      type="button"
      class="tab-btn"
      class:active={activeTab === "teachers"}
      onclick={() => (activeTab = "teachers")}
    >
      <i class="fas fa-chalkboard-teacher"></i> Teachers
    </button>
    <button
      type="button"
      class="tab-btn"
      class:active={activeTab === "books"}
      onclick={() => (activeTab = "books")}
    >
      <i class="fas fa-book"></i> Books
    </button>
  </nav>

  <div class="tab-content">
    {#if activeTab === "projects"}
      <ProjectsTab />
    {:else if activeTab === "teachers"}
      <TeachersTab />
    {:else}
      <BooksTab />
    {/if}
  </div>
</div>

<style lang="scss">
  .thefehrs-mass-edit {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;

    .mass-edit-tabs {
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

    .tab-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  }
</style>
