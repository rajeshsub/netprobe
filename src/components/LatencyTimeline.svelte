<script lang="ts">
  import type { TimedSample } from '../stores/testState.svelte'

  let {
    samples = [],
    title = '',
  }: {
    samples: TimedSample[]
    title?: string
  } = $props()

  const H = 168
  const PAD = { top: 34, right: 16, bottom: 40, left: 58 }

  let containerWidth = $state(600)
  let el: HTMLDivElement | undefined

  const cw = $derived(containerWidth - PAD.left - PAD.right)
  const ch = $derived(H - PAD.top - PAD.bottom)

  const rawMaxMs = $derived(samples.length ? Math.max(...samples.map((s) => s.ms)) : 100)
  const maxMs = $derived(Math.max(Math.ceil(rawMaxMs / 25) * 25, 50))
  const maxT = $derived(Math.max(samples.length ? samples.at(-1)!.t : 0, 10))

  function toX(t: number) {
    return PAD.left + (t / maxT) * cw
  }
  function toY(ms: number) {
    return PAD.top + ch - Math.min(1, ms / maxMs) * ch
  }

  const polylinePoints = $derived(
    samples.length > 1
      ? samples.map((s) => `${toX(s.t).toFixed(1)},${toY(s.ms).toFixed(1)}`).join(' ')
      : ''
  )

  const yTicks = $derived([0, Math.round(maxMs / 2), maxMs])

  const xTickStep = $derived(maxT <= 15 ? 5 : maxT <= 35 ? 10 : 15)
  const xTicks = $derived(
    Array.from({ length: Math.floor(maxT / xTickStep) + 1 }, (_, i) => i * xTickStep)
  )

  $effect(() => {
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      containerWidth = entries[0]?.contentRect.width || 600
    })
    obs.observe(el)
    return () => obs.disconnect()
  })
</script>

<div bind:this={el} class="timeline-wrap">
  <svg width={containerWidth} height={H} class="timeline-svg">
    <!-- Chart title -->
    {#if title}
      <text x={PAD.left} y={16} class="chart-title">{title}</text>
    {/if}

    <!-- Y-axis title: rotated "Latency (ms)" -->
    <text
      x={11}
      y={PAD.top + ch / 2}
      class="axis-title"
      text-anchor="middle"
      transform={`rotate(-90, 11, ${PAD.top + ch / 2})`}>Latency (ms)</text
    >

    <!-- Y-axis grid lines and tick labels -->
    {#each yTicks as tick}
      {@const y = toY(tick)}
      <line
        x1={PAD.left}
        y1={y}
        x2={PAD.left + cw}
        y2={y}
        stroke="var(--border-subtle)"
        stroke-width="1"
      />
      <text x={PAD.left - 5} y={y + 4} class="tick-label y-tick">{tick}</text>
    {/each}

    <!-- X-axis tick marks and labels -->
    {#each xTicks as tick}
      {@const x = toX(tick)}
      <line
        x1={x}
        y1={PAD.top + ch}
        x2={x}
        y2={PAD.top + ch + 5}
        stroke="var(--border-subtle)"
        stroke-width="1"
      />
      <text {x} y={PAD.top + ch + 16} class="tick-label x-tick">{tick}</text>
    {/each}

    <!-- X-axis title: "Elapsed time (s)" -->
    <text x={PAD.left + cw / 2} y={H - 3} class="axis-title" text-anchor="middle">
      Elapsed time (s)
    </text>

    <!-- Clip path -->
    <defs>
      <clipPath id="tl-clip">
        <rect x={PAD.left} y={PAD.top} width={cw} height={ch} />
      </clipPath>
    </defs>

    <!-- ECG line -->
    {#if polylinePoints}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="var(--accent)"
        stroke-width="1.5"
        stroke-linejoin="round"
        clip-path="url(#tl-clip)"
      />
    {:else}
      <text
        x={PAD.left + cw / 2}
        y={PAD.top + ch / 2 + 4}
        text-anchor="middle"
        class="placeholder-text"
      >
        Samples appear here during the test
      </text>
    {/if}

    <!-- Chart border -->
    <rect
      x={PAD.left}
      y={PAD.top}
      width={cw}
      height={ch}
      fill="none"
      stroke="var(--border-subtle)"
      stroke-width="1"
    />
  </svg>
</div>

<style>
  .timeline-wrap {
    width: 100%;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    padding: 0.25rem 0 0;
  }

  .timeline-svg {
    display: block;
  }

  .chart-title {
    font-size: 13px;
    font-weight: 600;
    fill: var(--text);
    font-family: inherit;
  }

  .axis-title {
    font-size: 12px;
    font-weight: 600;
    fill: var(--subtext);
    font-family: inherit;
  }

  .tick-label {
    font-size: 12px;
    fill: var(--subtext);
    font-variant-numeric: tabular-nums;
    font-family: inherit;
  }

  .y-tick {
    text-anchor: end;
  }

  .x-tick {
    text-anchor: middle;
  }

  .placeholder-text {
    font-size: 13px;
    fill: var(--subtext);
    opacity: 0.45;
    font-family: inherit;
  }
</style>
