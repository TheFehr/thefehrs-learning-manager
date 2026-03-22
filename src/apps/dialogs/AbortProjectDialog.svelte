<script lang="ts">
  let { projectName, actorName }: { projectName: string, actorName: string } = $props();
</script>

<div class="thefehrs-abort-dialog">
  <p>
    Are you sure you want to abort the project <strong>{projectName}</strong> for
    <strong>{actorName}</strong>?
  </p>
  <p>Any progress will be lost.</p>
</div>

<style lang="scss">
  .thefehrs-abort-dialog {
    p {
      margin: 0.5rem 0;
    }
  }
</style>
