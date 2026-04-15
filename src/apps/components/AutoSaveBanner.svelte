<script lang="ts">
  let { isSaving, saveError } = $props<{ isSaving: boolean, saveError: string | null }>();
</script>

<div class="auto-save-banner" role="status" aria-live="polite">
  {#if isSaving}
    <span class="saving-indicator"><i class="fas fa-spinner fa-spin"></i> Saving...</span>
  {:else if saveError}
    <span class="error-indicator"><i class="fas fa-exclamation-triangle"></i> {saveError}</span>
  {:else}
    <span class="saved-indicator"><i class="fas fa-check"></i> All changes saved</span>
  {/if}
</div>

<style lang="scss">
  .auto-save-banner {
    position: sticky;
    top: -0.5rem; 
    z-index: 10;
    background: var(--t5e-sheet-background, var(--t5e-background));
    padding: 0.5rem 1rem;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    font-size: 0.8rem;
    border-bottom: 1px solid var(--t5e-faint-color);
    margin: -0.5rem -1rem 0 -1rem; /* Negate parent padding, keep bottom gap from parent */
    min-height: 2.25rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    opacity: 0.85;
    transition: opacity 0.2s ease-in-out;

    &:hover {
        opacity: 1;
    }

    .saving-indicator { color: var(--t5e-primary-accent-color); }
    .saved-indicator { color: var(--t5e-success-color); }
    .error-indicator { color: var(--t5e-danger-color); }

    i {
        margin-right: 0.5rem;
    }
  }
</style>
