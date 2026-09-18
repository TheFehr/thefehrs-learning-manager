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

  <!-- One stable tabpanel wrapper per tab - see WorldSettingsConfig.svelte
       for why: TabBar's aria-controls on each tab button needs a real
       element to resolve to at all times, not just while that tab is
       active. -->
  <div class="tab-content">
    <div class="tab-panel" id="tabpanel-projects" role="tabpanel" aria-labelledby="tab-projects" tabindex="0" hidden={activeTab !== "projects"}>
      {#if activeTab === "projects"}
        <ProjectsTab />
      {/if}
    </div>
    <div class="tab-panel" id="tabpanel-teachers" role="tabpanel" aria-labelledby="tab-teachers" tabindex="0" hidden={activeTab !== "teachers"}>
      {#if activeTab === "teachers"}
        <TeachersTab />
      {/if}
    </div>
    <div class="tab-panel" id="tabpanel-books" role="tabpanel" aria-labelledby="tab-books" tabindex="0" hidden={activeTab !== "books"}>
      {#if activeTab === "books"}
        <BooksTab />
      {/if}
    </div>
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

      /* Each tab's own component (e.g. ProjectsTab) expects to be a direct
         flex child sized by this container - it sets height: 100% on its
         own root to drive its internal scroll area. The tabpanel wrapper
         sits between them now, so it needs to pass that sizing through
         rather than just shrink-to-fit its content. */
      .tab-panel {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
    }
  }
</style>
