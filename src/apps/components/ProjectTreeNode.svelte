<script lang="ts">
  import { slide } from "svelte/transition";
  import type { ProjectTreeNode } from "@/logic/tree-logic.js";
  import { projectData } from "@/logic/project-item.js";
  import ProjectTreeNodeComponent from "./ProjectTreeNode.svelte";
  import { TreeLogic } from "@/logic/tree-logic.js";
  import FollowUpPicker from "../dialogs/FollowUpPicker.svelte";
  import { unmount, mount } from "svelte";
  import { MODULE_ID } from "@/global.js";

  // --- Top-level Application Class ---

  class FollowUpPickerApp extends (foundry.applications.api.ApplicationV2 as any) {
    static override DEFAULT_OPTIONS = {
        window: { title: "Add Follow-up Project", resizable: true },
        position: { width: 450, height: 500 }
    };

    private instance: any = null;
    private parentItem: any;
    private onSelect: (uuid: string) => void;

    constructor(parentItem: any, onSelect: (uuid: string) => void, options = {}) {
        super(options);
        this.parentItem = parentItem;
        this.onSelect = onSelect;
    }

    protected override async _renderHTML() { return ""; }
    protected override _replaceHTML() {}

    protected override async _onRender() {
        const target = this.element.querySelector(".window-content") || this.element;
        this.instance = mount(FollowUpPicker, {
            target,
            props: {
                parentItem: this.parentItem,
                onSelect: (uuid: string) => {
                    this.onSelect(uuid);
                    this.close();
                },
                onClose: () => this.close()
            }
        });
    }

    override async close(o = {}) {
        if (this.instance) unmount(this.instance);
        return super.close(o);
    }
  }

  let { node, depth = 0, onRefresh } = $props<{
    node: ProjectTreeNode;
    depth?: number;
    onRefresh?: () => void;
  }>();

  let isExpanded = $state(node.expanded ?? depth < 1); // Expand roots by default
  
  $effect(() => {
    if (node.expanded !== undefined) {
      isExpanded = node.expanded;
    }
  });

  const hasChildren = $derived(node.children.length > 0);
  const data = $derived(projectData(node.item));
  const target = $derived(data?.target ?? 0);
  const compendiumLabel = $derived((node.item as any).pack ?? "World");

  function toggleExpand(e: MouseEvent) {
    e.stopPropagation();
    isExpanded = !isExpanded;
  }

  function openSheet() {
    if (node.item.sheet) {
      node.item.sheet.render(true);
    }
  }

  async function breakLink(e: MouseEvent) {
      e.stopPropagation();
      const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Break Follow-up Link" },
          content: `<p>Are you sure you want to break the link between this project and its parent?</p><p>It will become a new <b>Root</b> node.</p>`,
          rejectClose: false,
          modal: true
      });

      if (!confirmed) return;

      if (node.parentId) {
          const parentItem = await fromUuid(node.parentId as `Item.${string}`);
          if (parentItem) {
              const success = await TreeLogic.orphanProject(parentItem as any, node.uuid);
              if (success) onRefresh?.();
          }
      }
  }

  let isDragOver = $state(false);

  // --- Drag and Drop ---

  function onDragStart(e: DragEvent) {
      if (!e.dataTransfer) return;
      e.dataTransfer.setData("text/plain", node.uuid);
      e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: DragEvent) {
      e.preventDefault();
      if (!e.dataTransfer) return;
      e.dataTransfer.dropEffect = "move";
      isDragOver = true;
  }

  function onDragLeave() {
      isDragOver = false;
  }

  async function onDrop(e: DragEvent) {
      e.preventDefault();
      isDragOver = false;
      
      const draggedUuid = e.dataTransfer?.getData("text/plain");
      if (!draggedUuid || draggedUuid === node.uuid) return;

      const success = await TreeLogic.reparentProject(node.item, draggedUuid);
      if (success) onRefresh?.();
  }

  async function addFollowUp(e: MouseEvent) {
      e.stopPropagation();
      
      const pickerApp = new FollowUpPickerApp(node.item, async (uuid: string) => {
          // Promote parent to project if it isn't one
          if (!node.item.getFlag(MODULE_ID, "isLearningProject")) {
              await node.item.update({ [`flags.${MODULE_ID}.isLearningProject`]: true });
          }
          const success = await TreeLogic.reparentProject(node.item, uuid);
          if (success) onRefresh?.();
      });

      pickerApp.render(true);
  }
</script>

<div class="tree-node-wrapper" style="--depth: {depth}">
  <div 
    class="tree-node-content" 
    class:has-children={hasChildren}
    class:drag-over={isDragOver}
    onclick={openSheet}
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === "Enter" && openSheet()}
  >
    <div class="indent-guides">
        {#each Array(depth) as _}
            <div class="guide-line"></div>
        {/each}
    </div>

    <div class="node-drag-handle" draggable="true" ondragstart={onDragStart} role="presentation">
        <i class="fas fa-grip-vertical"></i>
    </div>

    {#if hasChildren}
      <button 
        type="button" 
        class:is-expanded={isExpanded} 
        onclick={toggleExpand}
        class="expand-button"
        aria-label={isExpanded ? "Collapse" : "Expand"}
      >
        <i class="fas fa-chevron-right"></i>
      </button>
    {:else}
      <div class="expand-spacer"></div>
    {/if}

    <div class="node-main">
      <img src={node.img} alt="" class="node-icon" />
      <span class="node-name">{node.name}</span>
    </div>

    <div class="node-meta">
      {#if target > 0}
        <span class="badge target-badge" title="Target Progress">
          <i class="fas fa-bullseye"></i> {target}
        </span>
      {/if}
      <span class="badge pack-badge" title="Source Compendium">
        <i class="fas fa-archive"></i> {compendiumLabel}
      </span>
    </div>

    <div class="node-actions">
        {#if depth > 0}
            <button type="button" class="icon-btn danger" title="Break Link" onclick={breakLink}>
                <i class="fas fa-link-slash"></i>
            </button>
        {/if}
        <button type="button" class="icon-btn" title="Add Follow-up" onclick={addFollowUp}>
            <i class="fas fa-plus"></i>
        </button>
    </div>
  </div>

  {#if hasChildren && isExpanded}
    <div class="node-children" transition:slide={{ duration: 200 }}>
      {#each node.children as child (child.uuid)}
        <ProjectTreeNodeComponent node={child} depth={depth + 1} {onRefresh} />
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .tree-node-wrapper {
    display: flex;
    flex-direction: column;
  }

  .tree-node-content {
    display: flex;
    align-items: center;
    padding: 6px 8px;
    gap: 8px;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s ease;
    border: 1px solid transparent;
    position: relative;

    &:hover {
      background-color: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);

      .node-actions {
          opacity: 1;
      }
    }

    &.drag-over {
        background-color: rgba(64, 150, 255, 0.2);
        border-color: #4096ff;
        transform: scale(1.01);
    }

    .indent-guides {
        display: flex;
        align-self: stretch;
        pointer-events: none;

        .guide-line {
            width: 20px;
            display: flex;
            justify-content: center;
            height: 100%;
            border-right: 1px solid rgba(255, 255, 255, 0.1);
        }
    }
  }

  .node-drag-handle {
      cursor: grab;
      color: var(--color-text-light-7);
      padding: 0 4px;
      z-index: 1;
      
      &:hover {
          color: var(--color-text-light-3);
      }

      &:active {
          cursor: grabbing;
      }
  }

  .expand-button {
    background: none;
    border: none;
    color: var(--color-text-light-6);
    cursor: pointer;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
    z-index: 1;

    &.is-expanded {
      transform: rotate(90deg);
    }

    &:hover {
      color: var(--color-text-light-1);
    }
  }

  .expand-spacer {
    width: 20px;
  }

  .node-main {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;

    .node-icon {
      width: 24px;
      height: 24px;
      object-fit: contain;
      border-radius: 2px;
      border: 1px solid var(--color-border-dark-1);
    }

    .node-name {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .node-meta {
    display: flex;
    gap: 8px;
    align-items: center;

    .badge {
      font-size: 0.75rem;
      padding: 2px 6px;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.2);
      color: var(--color-text-light-7);
      display: flex;
      align-items: center; gap: 4px;
      &.target-badge { color: var(--color-level-info); }
    }
  }

  .node-actions {
      opacity: 0;
      transition: opacity 0.2s ease;
      display: flex;
      gap: 4px;

      .icon-btn {
          background: none;
          border: none;
          color: var(--color-text-light-7);
          cursor: pointer;
          padding: 2px 6px;
          
          &:hover:not(:disabled) { color: var(--color-text-light-1); }
          &.danger:hover { color: var(--color-level-error); }
          &:disabled { opacity: 0.5; cursor: not-allowed; }
      }
  }

  .node-children {
    display: flex;
    flex-direction: column;
  }
</style>
