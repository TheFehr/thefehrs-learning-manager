<script lang="ts">
  import { Settings } from "../../core/settings.js";
  import type { ProjectRequirement, ComparisonOperator, Item5e } from "../../types.js";
  import { untrack } from "svelte";
  import { ItemConfigLogic } from "../../logic/item-config-logic.js";
  import { ensureCategoryExists } from "../../logic/settings-logic.js";
  import { LearningFeatType } from "../../logic/project-item.js";
  import CategorySelector from "../components/CategorySelector.svelte";

  let { item } = $props<{ item: Item5e }>();

  let targetValue = $state(0);
  let followUpProjectId = $state<string>("");
  let requirements = $state<ProjectRequirement[]>([]);
  let categories = $state<string[]>([]);
  let bookModifier = $state(0);
  let bookProjectUuids = $state<string[]>([]);
  let bookCategories = $state<string[]>([]);
  let isSaving = $state(false);
  let saveError = $state<string | null>(null);
  let initialized = $state(false);
  let initialSnapshot = $state<string>("");

  const uuid = $derived(item.uuid || "");
  const packId = $derived(uuid.split(".").length >= 3 ? `${uuid.split(".")[1]}.${uuid.split(".")[2]}` : "");
  const isProjectCompendium = $derived(Settings.get("allowedCompendiums").includes(packId));
  const isBookCompendium = $derived(Settings.get("bookCompendiums").includes(packId));

  const isAlreadyProject = $derived(!!item.getFlag("thefehrs-learning-manager", "isLearningProject"));
  const isLearnedReward = $derived(!!item.getFlag("thefehrs-learning-manager", "isLearnedReward"));
  const isLearningType = $derived(item.type === "feat" && (item.system as any).type?.value === LearningFeatType);
  const isActuallyProject = $derived(isAlreadyProject || isLearningType || isLearnedReward);

  const showProjectConfig = $derived(isProjectCompendium || isActuallyProject || (!isProjectCompendium && !isBookCompendium));
  const showBookConfig = $derived((isBookCompendium || (!isProjectCompendium && !isBookCompendium)) && !isActuallyProject);

  const operatorChoices: Record<ComparisonOperator, string> = {
    "==": "Equal To",
    "!=": "Not Equal To",
    ">": "Greater Than",
    ">=": "Greater Than or Equal To",
    "<": "Less Than",
    "<=": "Less Than or Equal To",
    "includes": "Includes (Array/String)"
  };

  // Initialize from item flags once
  $effect(() => {
    if (untrack(() => initialized)) return;
    const data = item.getFlag("thefehrs-learning-manager", "projectData");
    targetValue = data?.target ?? 0;
    followUpProjectId = data?.followUpProjectId ?? "";
    requirements = data?.requirements ? JSON.parse(JSON.stringify(data.requirements)) : [];
    categories = data?.categories ? [...data.categories] : [];

    const bookData = item.getFlag("thefehrs-learning-manager", "learningBookBonus");
    bookModifier = bookData?.modifier ?? 0;
    bookProjectUuids = bookData?.projectUuids ? [...bookData.projectUuids] : [];
    bookCategories = bookData?.categories ? [...bookData.categories] : [];
    
    initialSnapshot = JSON.stringify({ 
      target: targetValue, 
      followUpProjectId, 
      requirements, 
      categories,
      bookModifier, 
      bookProjectUuids,
      bookCategories
    });
    initialized = true;
  });

  // Auto-save logic
  $effect(() => {
    const target = targetValue;
    const followUpId = followUpProjectId;
    const reqs = requirements;
    const cats = categories;
    const bMod = bookModifier;
    const bProjects = bookProjectUuids;
    const bCats = bookCategories;
    
    if (!untrack(() => initialized)) return;

    const currentSnapshot = JSON.stringify({ 
      target, 
      followUpProjectId: followUpId, 
      requirements: reqs,
      categories: cats,
      bookModifier: bMod,
      bookProjectUuids: bProjects,
      bookCategories: bCats
    });
    if (currentSnapshot === untrack(() => initialSnapshot)) return;

    const timeout = setTimeout(() => {
      saveConfig(
        target, 
        followUpId, 
        JSON.parse(JSON.stringify(reqs)),
        [...cats],
        bMod,
        [...bProjects],
        [...bCats]
      );
    }, 500);

    return () => clearTimeout(timeout);
  });

  async function saveConfig(
    target: number, 
    followUpId: string, 
    reqs: ProjectRequirement[],
    cats: string[],
    bMod: number,
    bProjects: string[],
    bCats: string[]
  ) {
    isSaving = true;
    saveError = null;
    try {
      await ItemConfigLogic.saveConfig(item, target, followUpId, reqs, cats, bMod, bProjects, bCats);
      initialSnapshot = JSON.stringify({ 
        target, 
        followUpProjectId: followUpId, 
        requirements: reqs,
        categories: cats,
        bookModifier: bMod,
        bookProjectUuids: bProjects,
        bookCategories: bCats
      });
    } catch (err) {
      saveError = err instanceof Error ? err.message : String(err);
    } finally {
      setTimeout(() => isSaving = false, 500);
    }
  }

  function addRequirement() {
    requirements.push({
      id: (foundry.utils as unknown as { randomID: () => string }).randomID(),
      attribute: "system.abilities.int.value",
      operator: ">=",
      value: "10"
    });
  }

  function removeRequirement(id: string) {
    requirements = requirements.filter(r => r.id !== id);
  }

  async function handleSearchFollowUp() {
    const uuid = await ItemConfigLogic.searchFollowUp();
    if (uuid) followUpProjectId = uuid;
  }

  function handleDrop(e: DragEvent) {
    const uuid = ItemConfigLogic.handleDrop(e);
    if (uuid) followUpProjectId = uuid;
  }

  function addProjectToBook() {
    bookProjectUuids = [...bookProjectUuids, ""];
  }

  function removeProjectFromBook(index: number) {
    bookProjectUuids = bookProjectUuids.filter((_, i) => i !== index);
  }

  async function searchProjectForBook(index: number) {
    const uuid = await ItemConfigLogic.searchFollowUp();
    if (uuid) {
      bookProjectUuids[index] = uuid;
    }
  }

  function handleBookDrop(e: DragEvent, index: number) {
    const uuid = ItemConfigLogic.handleDrop(e);
    if (uuid) {
      bookProjectUuids[index] = uuid;
    }
  }
</script>

<div class="thefehrs-item-target-config">
  <header>
    <h3>Downtime Engine: Learning Configuration</h3>
    <p class="notes">Configure how this item is learned by players.</p>
  </header>

  {#if showProjectConfig}
  <section class="project-config-section">
    <h4>Project Configuration</h4>
    <div class="form-group">
      <label for="target-progress">Target Progress (Base Units)</label>
      <div class="form-fields">
        <input
          id="target-progress"
          type="number"
          bind:value={targetValue}
          onchange={(e) => e.stopPropagation()}
          oninput={(e) => e.stopPropagation()}
          min="0"
          placeholder="e.g. 10"
        />
      </div>
    </div>

    <div class="form-group">
      <label for="project-categories">Project Categories</label>
      <p class="notes" style="margin-top: 0;">Add categories/tags to this project for flexible instructor matching.</p>
      <CategorySelector bind:categories={categories} />
    </div>

    <div class="form-group">
      <label for="follow-up-project">Follow-up Project</label>
      <p class="notes" style="margin-top: 0;">If progress exceeds the target, prompt to start this project with excess progress.</p>
      <div class="form-fields" style="display: flex; gap: 0.5rem; align-items: center;">
        <input
          id="follow-up-project"
          type="text"
          bind:value={followUpProjectId}
          onchange={(e) => e.stopPropagation()}
          oninput={(e) => e.stopPropagation()}
          ondrop={(e) => { e.stopPropagation(); handleDrop(e); }}
          ondragover={(e) => e.preventDefault()}
          placeholder="Item UUID (e.g. Compendium.module.pack.Item.id)"
          style="flex: 1;"
        />
        <button type="button" class="tidy-button small" onclick={(e) => { e.stopPropagation(); handleSearchFollowUp(); }} title="Search for Follow-up Project">
          <i class="fas fa-search"></i>
        </button>
      </div>
    </div>

    <hr />

    <section class="requirements-section">
      <h5>Requirements</h5>
      <p class="notes">Players must meet these criteria to start learning this item.</p>
      
      <div class="requirements-list">
        {#each requirements as req (req.id)}
          <div class="requirement-row">
            <input type="text" bind:value={req.attribute} onchange={(e) => e.stopPropagation()} oninput={(e) => e.stopPropagation()} placeholder="Attribute Path" title="e.g. system.abilities.str.value" />
            <select bind:value={req.operator} onchange={(e) => e.stopPropagation()}>
              {#each Object.entries(operatorChoices) as [op, label]}
                <option value={op}>{label}</option>
              {/each}
            </select>
            <input type="text" bind:value={req.value} onchange={(e) => e.stopPropagation()} oninput={(e) => e.stopPropagation()} placeholder="Value" />
            <button type="button" class="tidy-button small danger" onclick={(e) => { e.stopPropagation(); removeRequirement(req.id); }} title="Remove Requirement">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        {/each}
      </div>

      <button type="button" class="tidy-button small" onclick={(e) => { e.stopPropagation(); addRequirement(); }}>
        <i class="fas fa-plus"></i> Add Requirement
      </button>
    </section>
  </section>
  {/if}

  {#if showBookConfig}
    {#if showProjectConfig}
      <hr />
    {/if}
    <section class="book-config-section">
      <h4>Learning Book Configuration</h4>
      <p class="notes">Configure this item to provide a bonus when held in a player's inventory during training.</p>

      <div class="form-group">
        <label for="book-modifier">Learning Modifier</label>
        <div class="form-fields">
          <input
            id="book-modifier"
            type="number"
            bind:value={bookModifier}
            onchange={(e) => e.stopPropagation()}
            oninput={(e) => e.stopPropagation()}
            min="0"
            placeholder="e.g. 2"
          />
        </div>
      </div>

      <div class="form-group">
        <label for="book-projects">Applicable Projects</label>
        <p class="notes" style="margin-top: 0;">Specify which projects this book provides a bonus for (leave empty for all).</p>
        <div class="requirements-list">
          {#each bookProjectUuids as projectUuid, index}
            <div class="requirement-row">
              <input
                type="text"
                bind:value={bookProjectUuids[index]}
                onchange={(e) => e.stopPropagation()}
                oninput={(e) => e.stopPropagation()}
                ondrop={(e) => { e.stopPropagation(); handleBookDrop(e, index); }}
                ondragover={(e) => e.preventDefault()}
                placeholder="Item UUID or Name"
                style="flex: 1;"
              />
              <button type="button" class="tidy-button small" onclick={(e) => { e.stopPropagation(); searchProjectForBook(index); }} title="Search Project">
                <i class="fas fa-search"></i>
              </button>
              <button type="button" class="tidy-button small danger" onclick={(e) => { e.stopPropagation(); removeProjectFromBook(index); }} title="Remove">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          {/each}
        </div>
        <button type="button" class="tidy-button small" onclick={(e) => { e.stopPropagation(); addProjectToBook(); }}>
          <i class="fas fa-plus"></i> Add Project
        </button>
      </div>

      <div class="form-group">
        <label for="book-categories">Applicable Categories</label>
        <p class="notes" style="margin-top: 0;">Specify categories this book provides a bonus for (leave empty for all).</p>
        <CategorySelector bind:categories={bookCategories} placeholder="e.g. Arcana, Spells" />
      </div>
    </section>
  {/if}

  <footer class="auto-save-footer">
    {#if isSaving}
      <span class="saving-indicator"><i class="fas fa-spinner fa-spin"></i> Saving...</span>
    {:else if saveError}
      <span class="error-indicator"><i class="fas fa-exclamation-triangle"></i> Save Failed</span>
    {:else}
      <span class="saved-indicator"><i class="fas fa-check"></i> All changes saved</span>
    {/if}
  </footer>
</div>

<style lang="scss">
  .thefehrs-item-target-config {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
    overflow-y: auto;

    h3, h4, h5 {
      border-bottom: 1px solid var(--t5e-faint-color);
      padding-bottom: 0.5rem;
      margin-top: 0;
    }

    h5 {
      border-bottom: none;
      padding-bottom: 0;
      margin-top: 0.5rem;
      font-size: 0.95rem;
    }

    .notes {
      font-size: 0.85rem;
      color: var(--t5e-secondary-color);
      margin-bottom: 0.5rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      label {
        font-weight: bold;
      }

      input {
        width: 100%;
      }
    }

    .requirements-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 0.5rem;

      .requirement-row {
        display: flex;
        gap: 0.5rem;
        align-items: center;

        input:first-child { flex: 2; }
        select { flex: 1.5; }
        input:nth-child(3) { flex: 1; }
      }
    }

    .requirements-section, .book-config-section, .project-config-section {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .auto-save-footer {
      margin-top: auto;
      padding-top: 1rem;
      display: flex;
      justify-content: flex-end;
      font-size: 0.8rem;
      opacity: 0.7;

      .saving-indicator {
        color: var(--t5e-primary-accent-color);
      }

      .saved-indicator {
        color: var(--t5e-success-color);
      }

      .error-indicator {
        color: var(--t5e-danger-color);
      }
    }

    button.danger {
      color: var(--t5e-danger-color);
      &:hover {
        background: var(--t5e-danger-color);
        color: white;
      }
    }
  }
</style>
