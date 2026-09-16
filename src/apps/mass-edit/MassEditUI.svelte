<script lang="ts">
  import ProjectsTab from "./ProjectsTab.svelte";
  import TeachersTab from "./TeachersTab.svelte";
  import BooksTab from "./BooksTab.svelte";
  import TabBar, { type TabDef } from "../components/TabBar.svelte";

  type MassEditTab = "projects" | "teachers" | "books";

  let activeTab = $state<MassEditTab>("projects");

  const tabs: TabDef<MassEditTab>[] = [
    { id: "projects", label: "Projects", icon: "fas fa-book-open" },
    { id: "teachers", label: "Teachers", icon: "fas fa-chalkboard-teacher" },
    { id: "books", label: "Books", icon: "fas fa-book" },
  ];
</script>

<div class="thefehrs-mass-edit">
  <TabBar {tabs} bind:activeTab />

  <div
    class="tab-content"
    role="tabpanel"
    id={`tabpanel-${activeTab}`}
    aria-labelledby={`tab-${activeTab}`}
    tabindex="0"
  >
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

    .tab-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  }
</style>
