<script lang="ts">
  import type { Snippet } from 'svelte'

  const DURATION_MS = 5600

  let {
    active = false,
    syncEpoch = 0,
    children,
  }: {
    active?: boolean
    syncEpoch?: number
    children?: Snippet
  } = $props()

  // Negative animation-delay places the dot at the correct position in the cycle
  // so all panels activated at different times appear in sync with each other.
  const animDelay = $derived.by(() => {
    if (!active) return '0s'
    const elapsed = syncEpoch > 0 ? (Date.now() - syncEpoch) % DURATION_MS : 0
    return `-${(elapsed / 1000).toFixed(3)}s`
  })
</script>

<div class="trace-wrap">
  {@render children?.()}
  {#if active}
    <span class="dot" style="animation-delay: {animDelay}" aria-hidden="true"></span>
  {/if}
</div>

<style>
  .trace-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* Let the single direct child fill the cell vertically */
  .trace-wrap > :global(*) {
    flex: 1;
    min-height: 0;
  }

  .dot {
    position: absolute;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow:
      0 0 3px 1px var(--accent),
      0 0 12px 5px var(--accent-glow),
      0 0 24px 10px var(--accent-glow);
    pointer-events: none;
    z-index: 20;
    transform: translate(-50%, -50%);
    animation: trace-perimeter 5.6s linear infinite;
    will-change: top, left;
  }

  /*
   * Keyframes hold one axis constant between corners to prevent diagonal cuts.
   * 75% of time on horizontal edges, 25% on vertical — approximates a 3:1
   * panel so apparent dot speed is roughly uniform around the perimeter.
   */
  @keyframes trace-perimeter {
    /* top: left → right */
    0% {
      top: 0%;
      left: 0%;
    }
    37.5% {
      top: 0%;
      left: 100%;
    }
    /* right: top → bottom */
    37.5% {
      top: 0%;
      left: 100%;
    }
    50% {
      top: 100%;
      left: 100%;
    }
    /* bottom: right → left */
    50% {
      top: 100%;
      left: 100%;
    }
    87.5% {
      top: 100%;
      left: 0%;
    }
    /* left: bottom → top */
    87.5% {
      top: 100%;
      left: 0%;
    }
    100% {
      top: 0%;
      left: 0%;
    }
  }
</style>
