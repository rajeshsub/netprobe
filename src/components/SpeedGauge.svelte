<script lang="ts">
  let {
    value,
    max,
    label,
    unit,
    active = false,
  }: {
    value: number
    max: number
    label: string
    unit: string
    active?: boolean
  } = $props()

  // Arc geometry: 270° sweep, start at bottom-left (135°), end at bottom-right (45°)
  const CX = 50, CY = 50, R = 38
  const START_DEG = 135
  const SWEEP_DEG = 270
  const PATH_LEN = (SWEEP_DEG / 360) * 2 * Math.PI * R  // ≈ 179.1

  const toRad = (d: number) => d * Math.PI / 180
  const sx = +(CX + R * Math.cos(toRad(START_DEG))).toFixed(3)
  const sy = +(CY + R * Math.sin(toRad(START_DEG))).toFixed(3)
  const ex = +(CX + R * Math.cos(toRad(START_DEG + SWEEP_DEG))).toFixed(3)
  const ey = +(CY + R * Math.sin(toRad(START_DEG + SWEEP_DEG))).toFixed(3)

  // The arc path (track and value share the same geometry)
  const arcD = `M ${sx},${sy} A ${R},${R} 0 1 1 ${ex},${ey}`

  const fraction = $derived(Math.min(1, Math.max(0, value / max)))
  const offset = $derived(+(PATH_LEN * (1 - fraction)).toFixed(3))

  // Peak trail: ghost at the leading edge, fades after value settles
  let peakOffset = $state(PATH_LEN)
  let trailOpacity = $state(0)
  let trailTimer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    const o = offset
    if (o < peakOffset) {
      peakOffset = o
      trailOpacity = 0.35
      if (trailTimer) clearTimeout(trailTimer)
      trailTimer = setTimeout(() => { trailOpacity = 0 }, 1200)
    }
  })

  const displayValue = $derived(
    value <= 0 ? '0' : value >= 100 ? value.toFixed(0) : value.toFixed(1)
  )
</script>

<div class="gauge" class:active>
  <div class="gauge-body">
    <svg viewBox="0 0 100 86" fill="none" aria-hidden="true">
      <defs>
        <filter id="arc-glow-{label}" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Track -->
      <path
        d={arcD}
        stroke="var(--border-subtle)"
        stroke-width="5"
        stroke-linecap="round"
        stroke-dasharray={PATH_LEN}
        stroke-dashoffset="0"
      />

      <!-- Trail (peak ghost) -->
      {#if trailOpacity > 0}
        <path
          d={arcD}
          stroke="var(--accent)"
          stroke-width="5"
          stroke-linecap="round"
          stroke-dasharray={PATH_LEN}
          stroke-dashoffset={peakOffset}
          opacity={trailOpacity}
          style="transition: opacity 1200ms ease-out"
        />
      {/if}

      <!-- Value arc -->
      <path
        d={arcD}
        stroke="var(--accent)"
        stroke-width="6"
        stroke-linecap="round"
        stroke-dasharray={PATH_LEN}
        stroke-dashoffset={offset}
        filter="url(#arc-glow-{label})"
        style="transition: stroke-dashoffset 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94)"
      />
    </svg>

    <div class="center">
      <span class="value">{displayValue}</span>
      <span class="unit">{unit}</span>
    </div>
  </div>

  <div class="label">{label}</div>
</div>

<style>
  .gauge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 1rem 0.75rem 0.875rem;
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    transition: border-color 0.25s, box-shadow 0.25s;
    min-width: 0;
  }

  .gauge.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent), 0 0 24px var(--accent-glow);
  }

  .gauge-body {
    position: relative;
    width: 100%;
  }

  svg {
    width: 100%;
    display: block;
  }

  .center {
    position: absolute;
    top: 46%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    pointer-events: none;
  }

  .value {
    font-size: clamp(1.5rem, 4.5vw, 2.25rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
    color: var(--text);
    line-height: 1;
  }

  .unit {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--accent);
  }

  .label {
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--subtext);
  }
</style>
