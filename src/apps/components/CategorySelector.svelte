<script lang="ts">
  import { Settings } from "@/core/settings.js";
  import { ensureCategoryExists } from "@/logic/settings-logic.js";
  import { Logger } from "@/core/logger.js";

  let { 
    categories = $bindable([]),
    placeholder = "e.g. Arcana, Blacksmithing"
  } = $props<{ 
    categories: string[],
    placeholder?: string
  }>();

  // Ensure categories is always an array
  $effect(() => {
    if (categories === undefined || categories === null) {
      categories = [];
    }
  });

  let globalCategories = $state(Settings.get("categories") || []);
  const listId = `global-categories-list-${Math.random().toString(36).substring(2, 9)}`;

  function addCategory() {
    categories = [...categories, ""];
  }

  function removeCategory(index: number) {
    categories = categories.filter((_, i) => i !== index);
  }

  async function onValueChange(val: string) {
    Logger.debug(`CategorySelector | Value changed: "${val}"`);
    if (val) {
      try {
        await ensureCategoryExists(val);
        // Refresh suggestions from settings after potentially adding a new one
        globalCategories = Settings.get("categories") || [];
      } catch (err) {
        Logger.error(`CategorySelector | Failed to ensure category "${val}" exists:`, err);
      }
    }
  }
</script>

<div class="category-selector-list">
  {#each categories as category, index}
    {@const inputId = `category-input-${index}-${Math.random().toString(36).substring(2, 9)}`}
    <div class="category-row">
      <label for={inputId} class="visually-hidden">Category {index + 1}</label>
      <input
        id={inputId}
        type="text"
        bind:value={categories[index]}
        onchange={(e) => { e.stopPropagation(); onValueChange(e.currentTarget.value); }}
        oninput={(e) => e.stopPropagation()}
        list={listId}
        {placeholder}
        aria-label="Category name"
        style="flex: 1;"
      />
      <button 
        type="button" 
        class="tidy-button small danger" 
        onclick={(e) => { e.stopPropagation(); removeCategory(index); }} 
        title="Remove Category"
        aria-label={`Remove category ${category || index + 1}`}
      >
        <i class="fas fa-trash"></i>
      </button>
    </div>
  {/each}
</div>
<button type="button" class="tidy-button small" onclick={(e) => { e.stopPropagation(); addCategory(); }}>
  <i class="fas fa-plus"></i> Add Category
</button>

<datalist id={listId}>
  {#each globalCategories as cat}
    <option value={cat}>{cat}</option>
  {/each}
</datalist>

<style lang="scss">
  .category-selector-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.5rem;

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .category-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;

      input {
        flex: 1;
      }
    }
  }

  button.danger {
    color: var(--t5e-danger-color);
    &:hover {
      background: var(--t5e-danger-color);
      color: white;
      border-color: var(--t5e-danger-color);
    }
  }
</style>
