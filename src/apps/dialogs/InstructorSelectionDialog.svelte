<script lang="ts">
  import type { InstructorInstance } from "@/logic/tutelage-resolver.js";
  import type { TimeUnit } from "@/types.js";
  import { TabLogic } from "@/logic/tab-logic.js";
  import { Logger } from "@/core/logger.js";

  let { 
    instructors, 
    bestBookMod, 
    bestBookNames = "",
    timeUnit, 
    lastInstructorUuid = "",
    lastInstructorName = "Self-Study",
  }: { 
    instructors: InstructorInstance[], 
    bestBookMod: number, 
    bestBookNames?: string,
    timeUnit: TimeUnit,
    lastInstructorUuid?: string,
    lastInstructorName?: string,
  } = $props();

  let selectedKey = $state(lastInstructorUuid && lastInstructorName !== "Self-Study" 
    ? JSON.stringify({ uuid: lastInstructorUuid, name: lastInstructorName }) 
    : "");
  let remember = $state(false);

  let selectedInstructor = $derived.by(() => {
    if (!selectedKey) return null;
    try {
      const { uuid, name } = JSON.parse(selectedKey);
      return instructors.find(i => i.actorUuid === uuid && i.offering.name === name) || null;
    } catch (e) {
      Logger.error("InstructorSelectionDialog | Failed to parse selectedKey:", e);
      return null;
    }
  });

  let effectiveMod = $derived(Math.max(bestBookMod ?? 0, selectedInstructor?.offering.modifier ?? 0));
  let costCp = $derived(selectedInstructor?.offering.costs[timeUnit.id] ?? 0);

  export function getResult() {
    return { instructor: selectedInstructor, remember };
  }
</script>

<div class="instructor-selection">
  <p>Choose an instructor for this session (<strong>{timeUnit.name}</strong>):</p>
  
  <div class="options">
    <label class="option" class:selected={selectedKey === ""} for="instructor-self">
      <input 
        id="instructor-self"
        type="radio" 
        name="instructor-choice" 
        value="" 
        bind:group={selectedKey} 
      />
      <span class="name">
        Self-Study
        {#if bestBookMod > 0 && bestBookNames}
            ({bestBookNames})
        {/if}
      </span>
      <span class="mod">+{bestBookMod}</span>
      <span class="cost">Free</span>
    </label>

    {#each instructors as instructor, i}
      {@const key = JSON.stringify({ uuid: instructor.actorUuid, name: instructor.offering.name })}
      {@const id = `instructor-${i}`}
      <label class="option" class:selected={selectedKey === key} for={id}>
        <input 
            id={id}
            type="radio" 
            name="instructor-choice" 
            value={key} 
            bind:group={selectedKey} 
            data-actor-uuid={instructor.actorUuid}
            data-offering-name={instructor.offering.name}
        />
        <span class="name">{instructor.name} ({instructor.offering.name})</span>
        <span class="mod">+{instructor.offering.modifier}</span>
        <span class="cost">{TabLogic.formatCurrency(instructor.offering.costs[timeUnit.id] || 0)}</span>
      </label>
    {/each}
  </div>

  <div class="summary">
    <div class="summary-line">
        <span>Final Modifier:</span>
        <span class="value">+{effectiveMod}</span>
    </div>
    <div class="summary-line">
        <span>Session Cost:</span>
        <span class="value">{TabLogic.formatCurrency(costCp)}</span>
    </div>
  </div>

  <div class="remember">
    <label>
      <input type="checkbox" bind:checked={remember} />
      <span>Remember choice for this project</span>
    </label>
  </div>
</div>

<style lang="scss">
  .instructor-selection {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.5rem;

    .options {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid var(--t5e-faint-color);
      border-radius: 4px;
      padding: 0.5rem;

      .option {
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem;
        cursor: pointer;
        border-radius: 4px;
        transition: background-color 0.2s;

        &:hover {
          background-color: var(--t5e-faint-color);
        }

        &.selected {
          background-color: var(--t5e-faint-color);
          font-weight: bold;
          outline: 1px solid var(--t5e-primary-accent-color);
        }

        .name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mod {
          color: var(--t5e-success-color);
          font-family: monospace;
          background: var(--t5e-faint-color);
          padding: 2px 4px;
          border-radius: 3px;
        }

        .cost {
          font-style: italic;
          color: var(--t5e-secondary-color);
        }
      }
    }

    .summary {
      background: var(--t5e-faint-color);
      padding: 0.75rem;
      border-radius: 4px;
      border: 1px solid var(--t5e-faint-color);

      .summary-line {
          display: flex;
          justify-content: space-between;
          
          .value {
              font-weight: bold;
          }
      }
    }

    .remember {
        font-size: 0.9em;
        margin-top: 0.5rem;
        
        label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
            line-height: normal;
        }

        input[type="checkbox"] {
            margin: 0;
            width: 14px;
            height: 14px;
            flex-shrink: 0;
        }
    }
  }
</style>
