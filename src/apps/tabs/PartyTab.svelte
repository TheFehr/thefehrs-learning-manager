<script lang="ts">
  import {Settings} from "@/core/settings.js";
  import type {MemberMappedData} from "@/apps/party-tab.js";
  import type {ProjectMappedData} from "@/logic/project-item.js";
  import {PartyTabLogic} from "@/logic/party-tab-logic.js";
  import {withProgressSuffix} from "@/logic/party-tab-pending.js";

  let {members: membersProp, isGM, actor} = $props<{
    members: MemberMappedData[];
    isGM: boolean;
    actor: Actor;
  }>();

  // svelte-ignore state_referenced_locally
  let members = $state(membersProp);

  $effect(() => {
    members = membersProp;
  });

  let isEditMode = $state(false);

  function openActorSheet(uuid: string) {
    PartyTabLogic.openActorSheet(uuid);
  }

  function grantTime() {
    PartyTabLogic.grantTime(members, actor);
  }


  function updateProgress(memberUuid: string, project: ProjectMappedData, newProgress: number) {
    // Optimistic local update to avoid flickering while waiting for silent backend update
    const member = members.find(m => m.uuid === memberUuid);
    if (member) {
        const p = member.projects.find(proj => proj.id === project.id);
        if (p) {
            const max = p.maxProgress || project.maxProgress || 0;
            p.progress = Math.max(0, Math.min(newProgress, max));
            // Update percentage for the bar
            p.progressPercentage = max > 0 ? Math.min(100, Math.round((p.progress / max) * 100)) : 0;
            p.name = withProgressSuffix(p.name, p.progress, max);
        }
    }
    PartyTabLogic.updateProgress(memberUuid, project, newProgress, isGM, actor);
  }

  function updateTarget(memberUuid: string, project: ProjectMappedData, newTarget: number) {
    // Optimistic local update
    const member = members.find(m => m.uuid === memberUuid);
    if (member) {
        const p = member.projects.find(proj => proj.id === project.id);
        if (p) {
            p.target = Math.max(0, newTarget);
            p.maxProgress = p.target;
            // Update percentage for the bar
            const max = p.maxProgress || 0;
            p.progressPercentage = max > 0 ? Math.min(100, Math.round((p.progress / max) * 100)) : 0;
            p.name = withProgressSuffix(p.name, p.progress, max);
        }
    }
    PartyTabLogic.updateTarget(memberUuid, project, newTarget, isGM, actor);
  }

  function deleteProject(memberUuid: string, project: ProjectMappedData) {
    PartyTabLogic.deleteProject(memberUuid, project, undefined, isGM, actor);
  }

  // completeProject's confirmation dialog isn't modal, so the underlying
  // sheet (and this button) stays interactive while it's open - without
  // this guard, a second click before the first dialog is dismissed starts
  // a second independent completion flow, and ProjectLifecycle.completeProject's
  // own isLearningProject check happens before its first await, so both
  // could pass it and each create a completed reward item.
  let completingProjects = $state<Record<string, boolean>>({});

  function completionKey(memberUuid: string, projectId: string): string {
    return `${memberUuid}:${projectId}`;
  }

  function completeProject(memberUuid: string, project: ProjectMappedData) {
    const key = completionKey(memberUuid, project.id);
    if (completingProjects[key]) return;
    completingProjects = { ...completingProjects, [key]: true };
    PartyTabLogic.completeProject(memberUuid, project, undefined, isGM, actor).finally(() => {
      const { [key]: _removed, ...rest } = completingProjects;
      completingProjects = rest;
    });
  }
</script>

<div class="party-learning-container thefehrs-party-tab">
    <aside class="sidebar expanded">
        {#if isGM}
            <div class="party-controls">
                <button type="button" class="grant-time-btn tidy-button" style="flex: 1 1 0%;" onclick={grantTime}>
                    <i class="fa-solid fa-clock-rotate-left"></i>
                    Distribute Time
                </button>
                <button
                        aria-checked={isEditMode}
                        class="toggle-progress-edit"
                        role="switch"
                        style="display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 5px; border-radius: 4px; background: rgba(0,0,0,0.1); width: 32px;"
                        title="Toggle Manual Progress Edit"
                        type="button"
                        onclick={() => (isEditMode = !isEditMode)}
                >
                    <i class="thumb-icon fas {isEditMode ? 'fa-unlock' : 'fa-lock'} fa-fw"></i>
                </button>
            </div>
        {/if}
        {#each members as member}
            <div
                    class="actor-container"
                    data-actor-id={member.id}
                    role="button"
                    tabindex="0"
                    onclick={() => openActorSheet(member.uuid)}
                    onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openActorSheet(member.uuid);
          }
        }}
            >
                <div class="actor-image-container flexshrink">
                    <div class="actor-image token">
                        <img src={member.tokenImg || member.img || 'modules/thefehrs-learning-manager/mystery-man.svg'} alt={member.name}/>
                    </div>
                </div>
                <div class="actor-name flexcol">
                    <h4 class="font-label-medium">{member.name}</h4>
                    <div class="separated-list">
            <span
                    class="actor-time-bank"
                    style="font-size: 0.85rem; color: var(--t5e-secondary-color);"
            >
              <i class="fa-solid fa-piggy-bank"></i>
                {member.formattedBank}
            </span>
                    </div>
                </div>
            </div>
        {/each}
    </aside>

    <div class="learning-main-content" style="flex: 1;">
        {#each members as member}
            <section
                    class="tidy-table"
                    data-tidy-sheet-part="item-table"
                    data-tidy-section-key="actor-{member.id}"
            >
                <header class="tidy-table-header-row theme-dark" data-tidy-sheet-part="table-header-row">
                    <div
                            class="tidy-table-header-cell header-label-cell primary"
                            data-tidy-sheet-part="table-header-cell"
                    >
                        <h3>{member.name}</h3>
                        <span class="table-header-count">{member.projects.length}</span>
                    </div>
                    <div
                            class="tidy-table-header-cell"
                            data-tidy-sheet-part="table-header-cell"
                            style="--tidy-table-column-width: min(70%, 550px);"
                    >
                        Progress
                    </div>
                    <div
                            class="tidy-table-header-cell"
                            data-tidy-sheet-part="table-header-cell"
                            style="--tidy-table-column-width: 76px;"
                    ></div>
                </header>

                <div class="item-table-body">
                    {#if member.projects.length}
                        {#each member.projects as project}
                            <div class="tidy-table-row project-row">
                                <div class="tidy-table-cell text-cell primary item-label flexcol">
                                    <span class="font-label-medium color-text-default">{project.name}</span>
                                    <span class="font-body-small color-text-lightest">
                                        {project.isSelfStudy ? 'Self-Study' : `Tutor: ${project.guidanceType}`}
                                    </span>
                                </div>

                                <div
                                        class="tidy-table-cell"
                                        data-tidy-sheet-part="table-cell"
                                        style="--tidy-table-column-width: min(70%, 550px);"
                                >
                                    {#if project.maxProgress <= 0 && !(isGM && isEditMode)}
                                        <div class="awaiting-target-badge font-label-medium">
                                            <i class="fas fa-exclamation-circle"></i> Awaiting GM Target
                                        </div>
                                    {:else}
                                        <div class="hp-column-content" style="width: 100%;">
                                            <div
                                                    class="meter progress"
                                                    style="--bar-percentage: {project.progressPercentage}%; --bar-adjusted: 0%; --bar-adjusted-background: var(--t5e-color-hp-temp); --bar-adjusted-content: '';"
                                            ></div>
                                            <div class="flexrow progress-container">
                                                {#if isGM && isEditMode}
                                                    <input
                                                            type="number"
                                                            class="update-project-progress"
                                                            value={project.progress}
                                                            onchange={(e) =>
                                updateProgress(
                                  member.uuid,
                                  project,
                                  parseInt(e.currentTarget.value) || 0,
                                )}
                                                            style="width: 50px; text-align: center; height: 1.25rem; z-index: 2;"
                                                    />
                                                {:else}
                            <span class="font-data-medium color-text-default value progress-read-only"
                            >{project.progress}</span
                            >
                                                {/if}
                                                <span class="font-body-medium color-text-lightest separator">/</span>
                                                {#if isGM && isEditMode}
                                                    <input
                                                            type="number"
                                                            class="update-project-target"
                                                            value={project.maxProgress}
                                                            onchange={(e) =>
                                updateTarget(
                                  member.uuid,
                                  project,
                                  parseInt(e.currentTarget.value) || 0,
                                )}
                                                            style="width: 50px; text-align: center; height: 1.25rem; z-index: 2;"
                                                    />
                                                {:else}
                                                    <span class="font-label-medium color-text-default max"
                                                    >{project.maxProgress}</span
                                                    >
                                                {/if}
                                            </div>
                                        </div>
                                    {/if}
                                </div>

                                <div
                                        class="tidy-table-cell"
                                        data-tidy-sheet-part="table-cell"
                                        style="--tidy-table-column-width: 76px; display: flex; justify-content: center; align-items: center; gap: 4px;"
                                >
                                    {#if isGM && isEditMode}
                                        <button
                                                type="button"
                                                class="complete-project party-edit-control tidy-button small"
                                                title="Complete Project"
                                                aria-label="Complete Project"
                                                disabled={completingProjects[completionKey(member.uuid, project.id)]}
                                                onclick={() => completeProject(member.uuid, project)}
                                                style="min-width: 2rem; padding: 2px 4px; color: var(--t5e-color-success, #2e7d32);"
                                        >
                                            <i class="fas fa-flag-checkered"></i>
                                        </button>
                                    {/if}
                                    {#if project.canAbort && isEditMode}
                                        <button
                                                type="button"
                                                class="delete-project party-edit-control tidy-button small"
                                                title="Abort Project"
                                                aria-label="Abort Project"
                                                onclick={() => deleteProject(member.uuid, project)}
                                                style="min-width: 2rem; padding: 2px 4px; color: var(--t5e-danger-color);"
                                        >
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    {:else}
                        <div class="tidy-table-row">
                            <div
                                    class="tidy-table-cell text-cell primary item-label flexcol"
                                    style="font-style: italic; opacity: 0.5; text-align: center; justify-content: center; padding: 1rem; flex: 1;"
                            >
                                No active projects
                            </div>
                        </div>
                    {/if}
                </div>
            </section>
        {/each}
    </div>
</div>

<style lang="scss">
  .party-learning-container {
    display: flex;
    flex-direction: row;
    height: 100%;
    width: 100%;
    min-height: 400px;
    overflow: hidden;

    .sidebar {
      flex: 0 0 220px;
      padding-right: 1rem;
      border-right: 1px solid var(--t5e-faint-color);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .party-controls {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
        padding: 10px;
      }

      .actor-container {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem;
        border-radius: 5px;
        transition: background 0.2s ease;
        cursor: pointer;

        &:hover {
          background: var(--t5e-faint-color);
        }

        .actor-image-container {
          .actor-image.token img {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 1px solid var(--t5e-faint-color);
          }
        }

        .actor-name {
          display: flex;
          flex-direction: column;

          h4 {
            margin: 0;
            font-size: 0.9rem;
          }
        }
      }
    }

    .learning-main-content {
      flex: 1;
      padding: 0.5rem 1.5rem;
      overflow-y: auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;

      .tidy-table-header-row,
      .tidy-table-row {
        display: flex;
        align-items: center;
      }

      .tidy-table-header-cell,
      .tidy-table-cell {
        display: flex;
        align-items: center;
        flex: 0 0 var(--tidy-table-column-width, auto);
        padding: 0 0.5rem;

        &.primary {
          flex: 1;
        }
      }

      .hp-column-content {
        width: 100%;
        position: relative;
        height: var(--meter-height, 1.5rem);
      }

      .awaiting-target-badge {
        background: var(--t5e-warning-accent-color);
        color: var(--t5e-color-inverse);
        padding: 2px 8px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.75rem;
        white-space: nowrap;
      }

      /* Value/max/separator sit centered directly over the bar rather than
         as a separate line above it, matching dnd5e's own meter convention
         (e.g. the HP meter's .label) - text-shadow keeps them legible
         against the gradient underneath, same as dnd5e's own .label .value/
         .max treatment. */
      .progress-container {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 4px;
        position: relative;
        z-index: 1;
        height: 100%;

        .value,
        .max {
          text-shadow: 0 0 4px var(--dnd5e-color-gold, #9f9275);
        }
      }

      /* Mirrors dnd5e's own .meter.progress::before treatment (its actual
         HP/resource bars) rather than a flat single-color fill: a gradient
         that shifts from blue toward maroon as it fills, darkened on the
         leading edge for depth, plus the same inset highlight and compact
         corner radius dnd5e uses for its embedded (non-meter-lg) bars. */
      .meter.progress {
        /* dnd5e's own .meter track background is a dark gray
           (--dnd5e-color-light-gray, confusingly - it's only "light"
           relative to --dnd5e-color-dark-gray, both are near-black), plus a
           gold border and inset shadow for depth - --t5e-faint-color looked
           like a bright, out-of-place pill against this dark theme, since
           tidy5e only ever uses that token for subtle borders/hover tints,
           never as a large solid fill. box-sizing: border-box keeps the new
           border inside the existing 100%/100% absolute box instead of
           overflowing it. */
        box-sizing: border-box;
        background: var(--dnd5e-color-light-gray, #3d3d3d);
        border: 1px solid var(--dnd5e-color-gold, #9f9275);
        border-radius: 2px;
        box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.25);
        height: 100%;
        width: 100%;
        position: absolute;
        top: 0;
        left: 0;
        overflow: hidden;

        &::before {
          --bar-color-2: color-mix(in oklab, var(--dnd5e-color-blue, cornflowerblue), var(--dnd5e-color-maroon, #741b2b) var(--bar-percentage));
          --bar-color-1: color-mix(in oklab, var(--bar-color-2), black 33%);
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: var(--bar-percentage);
          background: linear-gradient(to right, var(--bar-color-1), var(--bar-color-2));
          box-shadow: inset 0 1px 0 1px var(--dnd5e-highlight-40, rgba(255, 255, 255, 0.2));
          transition: width 0.4s ease;
        }
      }
    }
  }
</style>
