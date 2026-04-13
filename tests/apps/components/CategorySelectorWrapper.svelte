<script lang="ts">
  import CategorySelector from "@/apps/components/CategorySelector.svelte";
  let categories = $state(["cat1"]);
</script>

<div id="wrapper">
  <CategorySelector bind:categories={categories} />
  <div id="count">{categories.length}</div>
</div>
