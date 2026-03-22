<script lang="ts">
  import {Settings} from "../../core/settings.js";
  import {ActorProxy} from "../../actor-proxy.js";
  import {TabLogic} from "../../tab-logic.js";
  import {ProjectEngine} from "../../project-engine.js";
  import type {ProjectItem} from "../../project-item.js";
  import type {MemberMappedData, ProjectMappedData} from "../../party-tab.js";
  import type {Item5e} from "../../types.js";
  import AbortProjectDialog from "../dialogs/AbortProjectDialog.svelte";
  import GrantTimeDialog from "../dialogs/GrantTimeDialog.svelte";
  import {mount, unmount} from "svelte";

  let {members, tierOptions, isGM, actor} = $props<{
    members: MemberMappedData[];
    tierOptions: Record<string, string>;
    isGM: boolean;
    actor: Actor;
  }>();

  let isEditMode = $state(false);

  async function openActorSheet(uuid: string) {
    const doc = await fromUuid(uuid);
    if (doc && "sheet" in doc && doc.sheet) {
      doc.sheet.render(true);
    }
  }

  async function grantTime() {
    if (!isGM) return;

    const timeUnits = Settings.timeUnits;
    const isParty = actor.type === "group";

    const container = document.createElement("div");
    const svelteInstance = mount(GrantTimeDialog, {
      target: container,
      props: {
        timeUnits,
        isParty,
        members
      }
    });

    new foundry.appv1.api.Dialog({
      title: "Modify Training Time",
      content: container,
      buttons: {
        apply: {
          label: "Apply Time",
          icon: '<i class="fas fa-check"></i>',
          callback: async (dialogHtml: JQuery | HTMLElement) => {
            const htmlElement = dialogHtml instanceof HTMLElement ? dialogHtml : dialogHtml[0];
            const form = htmlElement.querySelector("form");
            if (!form) return;

            const formData = new FormData(form);

            let totalBase = 0;
            timeUnits.forEach((tu) => {
              totalBase += (parseInt(formData.get(`time_${tu.id}`) as string) || 0) * tu.ratio;
            });

            if (totalBase === 0) return ui.notifications?.warn("No time entered.");

            const selectedIds = isParty
              ? members.filter((m) => formData.has(`actor_${m.id}`)).map((m) => m.id)
              : [actor.id];

            if (selectedIds.length === 0)
              return ui.notifications?.warn("No recipients selected.");

            let successCount = 0;
            for (const id of selectedIds) {
              const a = game.actors?.get(id);
              if (!globalThis.Actor || !(a instanceof globalThis.Actor)) continue;
              try {
                const proxy = ActorProxy.forActor(a);
                const bank = proxy.bank;
                await proxy.setBank({total: (bank.total || 0) + totalBase});
                successCount++;
              } catch (err) {
                console.error(`Failed to update bank for actor ${id}:`, err);
              }
            }

            const actionWord = totalBase > 0 ? "Granted" : "Deducted";
            const preposition = totalBase > 0 ? "to" : "from";
            const formattedTime = TabLogic.formatTimeBank(Math.abs(totalBase), timeUnits);

            const chatMessageClass = ChatMessage.implementation as unknown as { create: (data: object) => Promise<unknown> };
            await chatMessageClass.create({
              speaker: {alias: "Downtime System"},
              content: `${actionWord} <strong>${formattedTime}</strong> ${preposition} ${successCount} characters.`,
            });
          },
        },
      },
      default: "apply",
      close: () => {
        unmount(svelteInstance);
      }
    }).render(true);
  }

  async function updateGuidance(actorId: string, project: ProjectMappedData, tierId: string) {
    const targetActor = game.actors?.get(actorId);
    if (!targetActor) return;

    const tiers = Settings.guidanceTiers;
    const tier = tiers.find((t) => t.id === tierId);

    const item = targetActor.items.get(project.id);
    if (item) {
      await item.update({
        "flags.thefehrs-learning-manager.projectData.tutelageId": tier?.id ?? "",
      });
    }
  }

  async function updateProgress(actorId: string, project: ProjectMappedData, newProgress: number) {
    if (!isGM) return;
    const targetActor = game.actors?.get(actorId);
    if (!targetActor) return;

    const item = targetActor.items.get(project.id);
    if (item) {
      const proxyItem = (item as unknown) as ProjectItem;
      const projectData = proxyItem.getFlag("thefehrs-learning-manager", "projectData");

      projectData.progress = Math.max(0, Math.min(newProgress, projectData.target || 0));
      if (projectData.target > 0 && projectData.progress >= projectData.target && !projectData.isCompleted) {
        await ProjectEngine.completeProject((item as unknown) as Item5e);
      } else {
        await item.update({
          "flags.thefehrs-learning-manager.projectData": projectData
        });
      }
    }
  }

  async function updateTarget(actorId: string, project: ProjectMappedData, newTarget: number) {
    if (!isGM) return;
    const targetActor = game.actors?.get(actorId);
    if (!targetActor) return;

    const item = targetActor.items.get(project.id);
    if (item) {
      const projectData = (item.getFlag("thefehrs-learning-manager", "projectData") as any) || {};
      const oldTarget = projectData.target;
      projectData.target = Math.max(0, newTarget);
      console.debug(`Downtime Engine | updateTarget: Setting target to ${projectData.target} for ${item.name}`);
      
      const updateData = { "flags.thefehrs-learning-manager.projectData": projectData };

      if (oldTarget <= 0 && projectData.target > 0) {
        console.debug(`Downtime Engine | target increased from 0 to ${projectData.target}. Generating activities...`);
        const activitiesData = ProjectEngine.getActivitiesData(projectData.target);
        if (activitiesData.length > 0) {
           await item.createEmbeddedDocuments("Activity", activitiesData as never);
        }
      }

      await item.update(updateData);
    }
  }

  async function deleteProject(actorId: string, project: ProjectMappedData) {
    const targetActor = game.actors?.get(actorId);
    if (!targetActor || !targetActor.isOwner) {
      ui.notifications?.warn("You do not have permission to modify this actor's projects.");
      return;
    }

    if (project.progress > 0 && !isGM) {
      ui.notifications?.warn("You cannot abort an in-progress project.");
      return;
    }

    const projectName = project.name || "Unknown Project";

    const container = document.createElement("div");
    const svelteInstance = mount(AbortProjectDialog, {
      target: container,
      props: {
        projectName,
        actorName: targetActor.name || "Unknown Actor"
      }
    });

    new foundry.appv1.api.Dialog({
      title: "Abort Project",
      content: container,
      buttons: {
        yes: {
          icon: '<i class="fas fa-check"></i>',
          label: "Yes",
          callback: async () => {
            const item = targetActor.items.get(project.id);
            if (item) await item.delete();
          },
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "No",
        },
      },
      default: "no",
      close: () => {
        unmount(svelteInstance);
      }
    }).render(true);
  }
</script>

<div class="party-learning-container thefehrs-party-tab">
    <aside class="sidebar expanded">
        {#if isGM}
            <div class="party-controls">
                <button class="grant-time-btn tidy-button" style="flex: 1 1 0%;" onclick={grantTime}>
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
                    onclick={() => openActorSheet(`Actor.${member.id}`)}
                    onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openActorSheet(`Actor.${member.id}`);
          }
        }}
            >
                <div class="actor-image-container flexshrink">
                    <div class="actor-image token">
                        <img src={member.tokenImg} alt={member.name}/>
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
                            style="--tidy-table-column-width: min(30%, 250px);"
                    >
                        Progress
                    </div>
                    <div
                            class="tidy-table-header-cell"
                            data-tidy-sheet-part="table-header-cell"
                            style="--tidy-table-column-width: min(40%, 300px);"
                    >
                        Tutor/Guidance
                    </div>
                    <div
                            class="tidy-table-header-cell"
                            data-tidy-sheet-part="table-header-cell"
                            style="--tidy-table-column-width: 40px;"
                    ></div>
                </header>

                <div class="item-table-body">
                    {#if member.projects.length}
                        {#each member.projects as project}
                            <div class="tidy-table-row project-row">
                                <div class="tidy-table-cell text-cell primary item-label flexcol">
                                    <span class="font-label-medium color-text-default">{project.name}</span>
                                </div>

                                <div
                                        class="tidy-table-cell"
                                        data-tidy-sheet-part="table-cell"
                                        style="--tidy-table-column-width: min(30%, 250px);"
                                >
                                    {#if project.maxProgress <= 0}
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
                                  member.id,
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
                                  member.id,
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
                                        style="--tidy-table-column-width: min(40%, 300px);"
                                >
                                    <select
                                            class="update-project font-label-medium"
                                            value={project.tutelageId}
                                            onchange={(e) => updateGuidance(member.id, project, e.currentTarget.value)}
                                            style="width: 100%; height: 2rem;"
                                    >
                                        <option value="">-- No Tutor --</option>
                                        {#each Object.entries(tierOptions) as [id, label]}
                                            <option value={id}>{label}</option>
                                        {/each}
                                    </select>
                                </div>

                                <div
                                        class="tidy-table-cell"
                                        data-tidy-sheet-part="table-cell"
                                        style="--tidy-table-column-width: 40px; display: flex; justify-content: center; align-items: center;"
                                >
                                    {#if project.canAbort && isEditMode}
                                        <button
                                                class="delete-project party-edit-control tidy-button small"
                                                title="Abort Project"
                                                aria-label="Abort Project"
                                                onclick={() => deleteProject(member.id, project)}
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

      .progress-container {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 4px;
        position: relative;
        z-index: 1;
        height: 100%;
      }

      .meter.progress {
        background: var(--t5e-faint-color);
        border-radius: 7px;
        height: 100%;
        width: 100%;
        position: absolute;
        top: 0;
        left: 0;
        overflow: hidden;

        &::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: var(--bar-percentage);
          background: var(--t5e-primary-accent-color, var(--t5e-color-primary-accent, #4f5af7));
          transition: width 0.4s ease;
        }
      }
    }
  }
</style>
