<script lang="ts">
  import { onMount, mount, unmount } from "svelte";
  import { TreeLogic, type ProjectTreeNode } from "@/logic/tree-logic.js";
  import ProjectTreeNodeComponent from "./ProjectTreeNode.svelte";
  import { Logger } from "@/core/logger.js";
  import { Settings } from "@/core/settings.js";
  import { RootProjectPickerApp } from "../dialogs/RootProjectPickerApp.js";

  let { showAllItems = $bindable(false), searchQuery = $bindable("") } = $props<{
    showAllItems?: boolean;
    searchQuery?: string;
  }>();

  let forest = $state<ProjectTreeNode[]>([]);
  let isLoading = $state(true);
  let pinnedUuids = $state<string[]>([]);
  let errorMessage = $state<string | null>(null);
  let loadSeq = 0;

  async function loadTree() {
    const mySeq = ++loadSeq;
    try {
      isLoading = true;
      errorMessage = null;
      // Copy array to break proxy
      const rawPinned = [...pinnedUuids];
      const result = await TreeLogic.buildProjectTree(showAllItems, rawPinned);
      
      if (mySeq === loadSeq) {
        forest = result;
      }
    } catch (err) {
      if (mySeq === loadSeq) {
        Logger.error("Failed to load project tree:", true, err);
        errorMessage = "Failed to load project tree. Check console for details.";
      }
    } finally {
      if (mySeq === loadSeq) {
        isLoading = false;
      }
    }
  }

  function filterNode(node: ProjectTreeNode, query: string): ProjectTreeNode | null {
    const nameMatch = node.name.toLowerCase().includes(query);
    
    const filteredChildren = node.children
      .map(child => filterNode(child, query))
      .filter((child): child is ProjectTreeNode => child !== null);
    
    if (nameMatch || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren
      };
    }
    return null;
  }

  const filteredForest = $derived(
    !searchQuery 
      ? forest 
      : forest
          .map(node => filterNode(node, searchQuery.toLowerCase()))
          .filter((node): node is ProjectTreeNode => node !== null)
  );

  async function addRootProject() {
      const pickerApp = new RootProjectPickerApp((uuid: string) => {
          if (!pinnedUuids.includes(uuid)) {
              pinnedUuids = [...pinnedUuids, uuid];
          }
      });

      pickerApp.render(true);
  }

  function setAllExpansion(expanded: boolean) {
    const walk = (nodes: ProjectTreeNode[]): ProjectTreeNode[] => {
      return nodes.map(n => ({
        ...n,
        expanded,
        children: walk(n.children)
      }));
    };
    forest = walk(forest);
  }

  $effect(() => {
      loadTree();
  });
</script>

<div class="project-tree-container thefehrs-learning-manager">
  <header class="tree-header">
    <div class="header-left">
        <h2><i class="fas fa-sitemap"></i> Project Tree View</h2>
        <p class="subtitle">Hierarchical project paths from allowed compendiums</p>
    </div>
    
    <div class="header-actions">
      <label class="toggle-control" title="Show all items from compendiums, not just configured projects">
          <input type="checkbox" bind:checked={showAllItems} />
          <span>Show All Items</span>
      </label>

      <button type="button" class="tidy-button" onclick={addRootProject}>
          <i class="fas fa-plus"></i> Add Project
      </button>

      <div class="search-box">
        <i class="fas fa-search"></i>
        <input 
          type="text" 
          placeholder="Search projects..." 
          aria-label="Search projects"
          bind:value={searchQuery}
        />
      </div>

      <div class="button-group">
        <button type="button" class="tidy-button" onclick={() => setAllExpansion(true)} title="Expand All" aria-label="Expand all projects">
          <i class="fas fa-expand-alt"></i>
        </button>
        <button type="button" class="tidy-button" onclick={() => setAllExpansion(false)} title="Collapse All" aria-label="Collapse all projects">
          <i class="fas fa-compress-alt"></i>
        </button>
      </div>

      <button type="button" class="tidy-button refresh-btn" onclick={loadTree} title="Refresh Tree" aria-label="Refresh project tree">
        <i class="fas fa-sync" class:fa-spin={isLoading}></i>
      </button>
    </div>
  </header>

  <main class="tree-content">
    {#if isLoading}
      <div class="state-message">
        <i class="fas fa-spinner fa-spin"></i> Loading tree structure...
      </div>
    {:else if errorMessage}
      <div class="state-message error">
        <i class="fas fa-exclamation-triangle"></i> {errorMessage}
      </div>
    {:else if filteredForest.length === 0}
      <div class="state-message empty">
        <p>{searchQuery ? "No projects match your search." : "No projects found in allowed compendiums."}</p>
        {#if !searchQuery}
            <small>Ensure you have compendiums selected in World Settings.</small>
        {/if}
      </div>
    {:else}
      <div class="tree-root-list">
        {#each filteredForest as root (root.uuid)}
          <ProjectTreeNodeComponent node={root} depth={0} onRefresh={loadTree} />
        {/each}
      </div>
    {/if}
  </main>
</div>

<style lang="scss">
  .project-tree-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 400px;
    background: var(--color-bg-dark-1);
    color: var(--color-text-light-2);
    font-family: var(--font-primary);
  }

  .tree-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 1px solid var(--color-border-dark-1);
    gap: 16px;

    .header-left {
        h2 {
            margin: 0;
            font-size: 1.25rem;
            display: flex;
            align-items: center;
            gap: 12px;
            color: var(--color-text-light-1);

            i {
                color: var(--color-level-info);
            }
        }

        .subtitle {
            margin: 4px 0 0;
            font-size: 0.85rem;
            color: var(--color-text-light-7);
        }
    }

    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }

    .toggle-control {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.85rem;
        color: var(--color-text-light-7);
        cursor: pointer;

        input { margin: 0; }
        &:hover { color: var(--color-text-light-2); }
    }

    .search-box {
      position: relative;
      display: flex;
      align-items: center;

      i {
        position: absolute;
        left: 10px;
        color: var(--color-text-light-7);
        pointer-events: none;
      }

      input {
        padding: 6px 12px 6px 32px;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid var(--color-border-dark-2);
        border-radius: 4px;
        color: var(--color-text-light-2);
        width: 180px;
        transition: width 0.3s ease, border-color 0.3s ease;

        &:focus {
          width: 240px;
          border-color: var(--color-level-info);
          outline: none;
        }
      }
    }

    .button-group {
      display: flex;
      gap: 2px;
      background: rgba(0, 0, 0, 0.2);
      padding: 2px;
      border-radius: 4px;
      border: 1px solid var(--color-border-dark-2);

      .tidy-button {
          border: none;
          background: none;
          height: 28px;
          width: 32px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          
          &:hover {
              background: rgba(255, 255, 255, 0.1);
          }
      }
    }

    .refresh-btn {
        width: 32px;
        height: 32px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }
  }

  .tree-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;

    /* Custom scrollbar */
    &::-webkit-scrollbar {
      width: 8px;
    }
    &::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.1);
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }
  }

  .state-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-light-7);
    gap: 16px;
    font-size: 1.1rem;

    i {
      font-size: 2rem;
    }

    &.error i {
      color: var(--color-level-error);
    }

    &.empty {
        text-align: center;
        small {
            font-size: 0.8rem;
        }
    }
  }

  .tree-root-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
