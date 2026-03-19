<script lang="ts">
  import { Settings } from "../settings";
  import { ActorProxy } from "../actor-proxy";
  import { TabLogic } from "./tab-logic";
  import { LearningTab } from "./learning-tab";
  import { ProjectEngine } from "../project-engine";
  import type { TimeUnit, ProjectTemplate } from "../types";

  let { actor } = $props<{ actor: any }>();

  // Reactive data derived from the actor
  let data = $derived(LearningTab.getData(actor));

  let selectedProjectId = $state("");

  async function startProject() {
    if (!selectedProjectId) return;
    const tpl = data.library.find((t) => t.id === selectedProjectId);

    if (tpl) {
      const { eligible, reason } = TabLogic.meetsRequirements(actor, tpl.requirements || []);
      if (!eligible) {
        ui.notifications?.warn(`Requirement not met for ${tpl.name}: ${reason}`);
        return;
      }

      if (tpl.rewardType === "item") {
        await ProjectEngine.initiateProject(actor, tpl, "");
      } else {
        const proxy = ActorProxy.forActor(actor);
        const projects = proxy.projects;
        projects.push({
          id: foundry.utils.randomID(),
          templateId: tpl.id,
          progress: 0,
          guidanceTierId: "",
          isCompleted: false,
        });
        await proxy.setProjects(projects);
      }
      selectedProjectId = "";
    }
  }

  async function train(project: any, unitId: string) {
    if (project.isItemBased) {
      const item = actor.items.get(project.id);
      if (item) await ProjectEngine.processTraining(item, unitId);
    } else {
      await TabLogic.processTraining(actor, project.id, unitId);
    }
  }

  async function abortProject(project: any) {
    if (project.progress > 0 && !data.isGM) {
      ui.notifications?.warn("You cannot abort an in-progress project.");
      return;
    }

    const projectName = project.name || "Unknown Project";

    new foundry.appv1.api.Dialog({
      title: "Abort Project",
      content: `<p>Are you sure you want to abort the project <strong>${projectName}</strong>?</p><p>Any progress will be lost.</p>`,
      buttons: {
        yes: {
          icon: '<i class="fas fa-check"></i>',
          label: "Yes",
          callback: async () => {
            if (project.isItemBased) {
              const item = actor.items.get(project.id);
              if (item) await item.delete();
            } else {
              const proxy = ActorProxy.forActor(actor);
              const projects = proxy.projects;
              const updatedProjects = projects.filter((p: any) => p.id !== project.id);
              await proxy.setProjects(updatedProjects);
            }
          },
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "No",
        },
      },
      default: "no",
    }).render(true);
  }
</script>

<div class="thefehrs-container">
  <div class="bank-display">
    <span><i class="fas fa-hourglass-half"></i> Available Downtime: {data.formattedBank}</span>
  </div>

  <div class="add-project-zone">
    <select class="project-selector" bind:value={selectedProjectId}>
      <option value="">-- Select a Project to Start --</option>
      {#each data.library as tpl}
        <option value={tpl.id} disabled={tpl.disabled} title={tpl.title}>
          {tpl.label}
        </option>
      {/each}
    </select>
    <button class="add-selected-project tidy-button" onclick={startProject}>Start</button>
  </div>

  <section class="tidy-table">
    <header class="tidy-table-header-row">
      <div class="tidy-table-header-cell primary" style="--tidy-table-column-width: 30%">
        Active Projects
      </div>
      <div class="tidy-table-header-cell" style="--tidy-table-column-width: 50%;">Progress</div>
      <div class="tidy-table-header-cell" style="--tidy-table-column-width: 20%;">Actions</div>
    </header>

    <div class="active-projects-list item-table-body">
      {#each data.activeProjects as project}
        <div class="project-card tidy-table-row-container">
          <div class="tidy-table-row">
            <div class="tidy-table-cell primary item-label flexcol">
              <div class="cell-text">
                <span class="cell-name">{project.name}</span>
                <p class="tutor-info">
                  Tutor: {project.guidanceType}
                </p>
              </div>
            </div>

            <div class="tidy-table-cell" style="--tidy-table-column-width: 50%;">
              <div class="progress-container">
                <div class="progress-text">
                  {project.progress} / {project.maxProgress}
                </div>
                <div class="t5e-progress-bar">
                  <div class="t5e-progress-fill" style="width:{project.percent}%;"></div>
                </div>
              </div>
            </div>

            <div class="actions tidy-table-cell" style="--tidy-table-column-width: 20%;">
              {#if project.canAbort}
                <button
                  class="delete-project tidy-button small"
                  onclick={() => abortProject(project)}
                  title="Abort Project"
                >
                  <i class="fas fa-trash"></i>
                </button>
              {/if}
              {#if project.isItemBased}
                <button
                  class="tidy-button small"
                  onclick={() => actor.items.get(project.id)?.sheet.render(true)}
                  title="Open Item Sheet"
                >
                  <i class="fas fa-edit"></i>
                </button>
              {/if}
              {#each data.timeUnits as tu}
                <button
                  class="bulk-train tidy-button small"
                  onclick={() => train(project, tu.id)}
                  title="Spend 1 {tu.name}"
                >
                  <i class="fa-solid fa-plus"></i>
                  {tu.short}
                </button>
              {/each}
            </div>
          </div>
        </div>
      {:else}
        <div class="tidy-table-row-container">
          <div class="tidy-table-row" style="justify-content: center; padding: 1rem; opacity: 0.5;">
            No active projects
          </div>
        </div>
      {/each}
    </div>
  </section>

  {#if data.completedProjects.length}
    <div class="completed-projects-zone">
      <h3>
        <i class="fas fa-award"></i>
        Completed Training
      </h3>
      <div class="completed-list">
        {#each data.completedProjects as project}
          <div class="completed-card tidy-table-row">
            <span class="completed-name">
              <i class="fas fa-check-circle"></i>
              {project.name}
            </span>
            <span class="mastered-label">Mastered</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  .thefehrs-container {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
    overflow-y: auto;

    .bank-display {
      background: var(--t5e-faint-color);
      padding: 0.75rem;
      border-radius: 5px;
      font-weight: bold;
      text-align: center;
      border: 1px solid var(--t5e-faint-color);
    }

    .add-project-zone {
      display: flex;
      gap: 10px;
      margin-bottom: 5px;

      select {
        flex: 1;
      }
    }

    .tutor-info {
      font-size: 0.75rem;
      font-style: italic;
      margin: 0;
      opacity: 0.7;
    }

    .progress-container {
      width: 100%;

      .progress-text {
        font-size: 0.7rem;
        margin-bottom: 2px;
        text-align: center;
      }
    }

    .t5e-progress-bar {
      background: var(--t5e-faint-color);
      border-radius: 4px;
      height: var(--meter-height, 1.25rem);
      overflow: hidden;
      border: 1px solid var(--t5e-faint-color);
      margin-top: 4px;
      position: relative;

      .t5e-progress-fill {
        background: var(--t5e-primary-accent-color, var(--t5e-color-primary-accent, #4f5af7));
        height: 100%;
        transition: width 0.4s ease-in-out;
      }
    }

    .actions {
      display: flex;
      gap: 5px;
      justify-content: flex-end;

      button {
        min-width: 2rem;
        padding: 2px 4px;

        &.delete-project {
          color: var(--t5e-danger-color);
        }

        &.bulk-train {
          min-width: 3rem;
        }
      }
    }

    .completed-projects-zone {
      margin-top: 25px;

      h3 {
        border-bottom: 1px solid var(--t5e-faint-color);
        padding-bottom: 5px;
        color: var(--t5e-secondary-color);
        font-size: 1.1rem;
      }

      .completed-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 10px;
      }

      .completed-card {
        padding: 0 10px;
        height: 32px;
        align-items: center;

        .completed-name {
          font-weight: bold;
          color: var(--t5e-primary-font-color);
          flex: 1;

          i {
            color: #28a745;
            margin-right: 8px;
          }
        }

        .mastered-label {
          font-size: 0.75rem;
          font-style: italic;
          opacity: 0.6;
        }
      }
    }
  }

  :global {
    .tidy-table {
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
    }
    .tidy-table-header-row,
    .tidy-table-row {
      display: flex !important;
      width: 100% !important;
      align-items: center !important;
    }
    .tidy-table-header-cell,
    .tidy-table-cell {
      flex: 0 0 var(--tidy-table-column-width, auto) !important;
      display: flex !important;
      align-items: center !important;
      padding: 0 0.5rem !important;
      min-height: 2.75rem;

      &.primary {
        flex: 1 1 0% !important;
      }
    }
  }
</style>
