declare module "*.svelte" {
  import { SvelteComponent } from "svelte";
  /** @deprecated Use `mount` instead */
  export default class extends SvelteComponent<any, any, any> {}
}
