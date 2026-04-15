<script lang="ts">
  import { Settings } from "@/core/settings.js";
  import type { ProjectRequirement, ComparisonOperator, Item5e } from "@/types.js";
  import { untrack } from "svelte";
  import { ItemConfigLogic } from "@/logic/item-config-logic.js";
  import { LearningFeatType } from "@/logic/project-item.js";
  import CategorySelector from "@/apps/components/CategorySelector.svelte";
  import AutoSaveBanner from "@/apps/components/AutoSaveBanner.svelte";

  let { item } = $props<{ item: Item5e }>();

  let targetValue = $state(0);
  let followUpProjectId = $state<string>("");
  let requirements = $state<ProjectRequirement[]>([]);
  let categories = $state<string[]>([]);
  let bookModifier = $state(0);
  let bookCategories = $state<string[]>([]);
  let learningModeEnabled = $state(false);
  let isSaving = $state(false);
  let saveError = $state<string | null>(null);
  let initialized = $state(false);
  let initialSnapshot = $state<string>("");
  let saveCounter = 0;

  const uuid = $derived(item.uuid || "");
  const packId = $derived.by(() => {
    if (typeof uuid !== "string" || !uuid) return "";
    const segments = uuid.split(".");
    if (segments.length < 3) return "";
    // Standard compendium UUID: Compendium.module.pack.Item.id
    if (segments[0] === "Compendium") return `${segments[1]}.${segments[2]}`;
    return "";
  });
  const isProjectCompendium = $derived(packId ? Settings.get("allowedCompendiums").includes(packId) : false);
  const isBookCompendium = $derived(packId ? Settings.get("bookCompendiums").includes(packId) : false);

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
    bookCategories = bookData?.categories ? [...bookData.categories] : [];

    learningModeEnabled = (item.getFlag("thefehrs-learning-manager", "learningModeEnabled") as boolean) 
      ?? (isActuallyProject || !!bookData || !!data);
    
    initialSnapshot = JSON.stringify({ 
      learningModeEnabled,
      target: targetValue, 
      followUpProjectId, 
      requirements, 
      categories,
      bookModifier, 
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
    const bCats = bookCategories;
    const enabled = learningModeEnabled;
    
    if (!untrack(() => initialized)) return;

    const currentSnapshot = JSON.stringify({ 
      learningModeEnabled: enabled,
      target, 
      followUpProjectId: followUpId, 
      requirements: reqs,
      categories: cats,
      bookModifier: bMod,
      bookCategories: bCats
    });
    if (currentSnapshot === untrack(() => initialSnapshot)) return;

    const timeout = setTimeout(() => {
      saveConfig(
        enabled,
        showProjectConfig ? {
          target,
          followUpProjectId: followUpId,
          requirements: JSON.parse(JSON.stringify(reqs)),
          categories: [...cats]
        } : undefined,
        showBookConfig ? {
          modifier: bMod,
          categories: [...bCats]
        } : undefined
      );
    }, 500);

    return () => clearTimeout(timeout);
  });

  // Clear target validation error immediately when fixed
  $effect(() => {
    if (targetValue > 0 && saveError === "Target progress must be greater than 0.") {
      saveError = null;
    }
  });

  async function saveConfig(
    enabled: boolean,
    project?: { target: number; followUpProjectId: string; requirements: ProjectRequirement[]; categories: string[] },
    book?: { modifier: number; categories: string[] }
  ) {
    if (enabled && project && project.target <= 0) {
      saveError = "Target progress must be greater than 0.";
      return;
    }
    const token = ++saveCounter;
    isSaving = true;
    saveError = null;
    try {
      const ok = await ItemConfigLogic.saveConfig(item, enabled, project, book);
      if (token === saveCounter) {
        if (ok === false) {
          saveError = "Failed to save configuration. Please try again.";
        } else {
          initialSnapshot = JSON.stringify({ 
            learningModeEnabled: enabled,
            target: project?.target ?? 0, 
            followUpProjectId: project?.followUpProjectId ?? "", 
            requirements: project?.requirements ?? [], 
            categories: project?.categories ?? [],
            bookModifier: book?.modifier ?? 0, 
            bookCategories: book?.categories ?? []
          });
        }
      }
    } catch (err) {
      if (token === saveCounter) {
        saveError = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (token === saveCounter) {
        isSaving = false;
      }
    }
  }

  function addRequirement() {
    requirements = [
      ...requirements,
      {
        id: foundry.utils.randomID(),
        attribute: "system.abilities.int.value",
        operator: ">=",
        value: "10",
      },
    ];
  }

  function removeRequirement(id: string) {
    requirements = requirements.filter(r => r.id !== id);
  }

  async function handleSearchFollowUp() {
    const uuid = await ItemConfigLogic.searchFollowUp();
    if (uuid) followUpProjectId = uuid;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const uuid = ItemConfigLogic.handleDrop(e);
    if (uuid) followUpProjectId = uuid;
  }
</script>

<div class="thefehrs-item-target-config">
  <AutoSaveBanner {isSaving} {saveError} />

  <div class="learning-mode-toggle">
    <div class="form-group" style="margin: 0; padding: 0; background: none; border: none; flex-direction: row; flex-wrap: nowrap; align-items: center; justify-content: space-between;">
      <label for="learning-mode-enabled" style="font-weight: bold; cursor: pointer; margin-bottom: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Enable Learning Configuration</label>
      <div class="form-fields" style="display: flex; justify-content: flex-end; flex: 0 0 30px;">
        <input id="learning-mode-enabled" type="checkbox" bind:checked={learningModeEnabled} style="width: auto; margin: 0; cursor: pointer;" />
      </div>
    </div>
    <p class="notes">Configure this item as a learnable project or a reference book.</p>
  </div>

  {#if learningModeEnabled}
  <hr style="margin: 0;" />
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
        <button type="button" class="tidy-button small" onclick={(e) => { e.stopPropagation(); handleSearchFollowUp(); }} title="Search for Follow-up Project" aria-label="Search for follow-up project">
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
            <button type="button" class="tidy-button small danger" onclick={(e) => { e.stopPropagation(); removeRequirement(req.id); }} title="Remove Requirement" aria-label="Remove requirement">
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
        <label for="book-categories">Applicable Categories</label>
        <p class="notes" style="margin-top: 0;">Specify categories this book provides a bonus for (leave empty for all).</p>
        <CategorySelector bind:categories={bookCategories} placeholder="e.g. Arcana, Spells" />
      </div>
    </section>
  {/if}
  {/if}
</div>

<style lang="scss">
  .thefehrs-item-target-config {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;

    h4 {
      border-bottom: 1px solid var(--t5e-faint-color);
      padding-bottom: 0.5rem;
      margin-top: 0;
    }

    h5 {
      margin-top: 0.5rem;
      font-size: 0.95rem;
    }

    .notes {
      font-size: 0.85rem;
      color: var(--t5e-secondary-color);
      margin-bottom: 0.5rem;
    }

    .learning-mode-toggle {
      .notes {
        margin-top: 0.25rem;
        margin-bottom: 0;
        font-size: 0.85rem;
        color: var(--t5e-secondary-color);
      }
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

    button.danger {
      color: var(--t5e-danger-color);
      &:hover {
        background: var(--t5e-danger-color);
        color: white;
      }
    }
  }
</style>
