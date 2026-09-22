<script lang="ts">
  let { projectName, actorName }: { projectName: string, actorName: string } = $props();
</script>

<div class="thefehrs-complete-dialog">
  <p>
    Mark the project <strong>{projectName}</strong> for
    <strong>{actorName}</strong> as complete?
  </p>
  <p>This finishes the project immediately, regardless of its current progress.</p>
</div>

<style lang="scss">
  .thefehrs-complete-dialog {
    p {
      margin: 0.5rem 0;
    }
  }
</style>
