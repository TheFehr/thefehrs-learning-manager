<script lang="ts">
  import RulesConfig from "@/apps/components/RulesConfig.svelte";
  import type { SystemRules } from "@/types";

  let { initialRules } = $props<{ initialRules: SystemRules }>();
  let rules = $state(initialRules);

  export function getRules() {
    return rules;
  }
</script>

<RulesConfig bind:rules={rules} />
