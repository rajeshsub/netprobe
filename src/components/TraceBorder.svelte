<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    active = false,
    done = false,
    children,
  }: {
    active?: boolean
    done?: boolean
    children?: Snippet
  } = $props()
</script>

<div class="trace-wrap" class:active class:done>
  {@render children?.()}
</div>

<style>
  .trace-wrap {
    display: flex;
    flex-direction: column;
    border-radius: 0;
    box-shadow: 0 0 0 0 transparent;
    transition: box-shadow 0.4s ease;
  }

  .trace-wrap > :global(*) {
    flex: 1;
    min-height: 0;
  }

  .trace-wrap.active {
    box-shadow: 0 0 0 2px var(--accent);
  }

  .trace-wrap.done {
    box-shadow: 0 0 0 2px var(--grade-a);
  }
</style>
