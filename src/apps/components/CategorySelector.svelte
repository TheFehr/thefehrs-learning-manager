<script lang="ts">
  import { Settings } from "../../core/settings.js";
  import { ensureCategoryExists } from "../../logic/settings-logic.js";
  import { Logger } from "../../core/logger.js";

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

  const globalCategories = $derived(Settings.get("categories") || []);
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
      await ensureCategoryExists(val);
    }
  }
</script>

<div class="category-selector-list">
  {#each categories as category, index}
    <div class="category-row">
      <input
        type="text"
        bind:value={categories[index]}
        onchange={(e) => { e.stopPropagation(); onValueChange(e.currentTarget.value); }}
        oninput={(e) => e.stopPropagation()}
        onblur={(e) => { e.stopPropagation(); onValueChange(e.currentTarget.value); }}
        list={listId}
        {placeholder}
        style="flex: 1;"
      />
      <button type="button" class="tidy-button small danger" onclick={(e) => { e.stopPropagation(); removeCategory(index); }} title="Remove Category">
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
