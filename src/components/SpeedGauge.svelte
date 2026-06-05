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

  const fraction = $derived(Math.min(1, Math.max(0, value / max)))

  const displayValue = $derived(
    value <= 0 ? '0' : value >= 100 ? value.toFixed(0) : value.toFixed(1)
  )

  // Peak-hold trail — marker sits at the highest value seen, fades after 1.4 s hold.
  let peakFraction = $state(0)
  let trailOpacity = $state(0)
  let trailTimer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    const f = fraction
    if (f > peakFraction) {
      peakFraction = f
      trailOpacity = 0.6
      if (trailTimer) clearTimeout(trailTimer)
      trailTimer = setTimeout(() => {
        trailOpacity = 0
      }, 1400)
    }
  })
</script>

<div class="gauge" class:active>
  <span class="label">{label}</span>

  <div class="center">
    <span class="value">{displayValue}</span>
    <span class="unit">{unit}</span>
  </div>

  <div class="bar-wrap">
    <div class="bar-track">
      <div class="bar-fill" style="width: {fraction * 100}%"></div>
      <div class="bar-peak" style="left: {peakFraction * 100}%; opacity: {trailOpacity}"></div>
    </div>
  </div>
</div>

<style>
  .gauge {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.875rem 0.875rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    transition:
      border-color 0.25s,
      box-shadow 0.25s;
    container-type: inline-size;
    min-width: 0;
  }

  .gauge.active {
    border-color: var(--accent);
    box-shadow:
      0 0 0 1px var(--accent),
      0 0 24px var(--accent-glow);
  }

  .label {
    font-size: 0.6rem;
    font-weight: 500;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--subtext);
  }

  .center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 0.5rem 0 0.375rem;
  }

  .value {
    font-size: clamp(1.5rem, 18cqi, 2.75rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
    color: var(--text);
    line-height: 1;
  }

  .unit {
    font-size: 0.58rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }

  /* ── Bar ─────────────────────────────────────────── */

  .bar-wrap {
    padding-top: 0.2rem;
  }

  .bar-track {
    position: relative;
    height: 3px;
    background: var(--border-subtle);
    border-radius: 99px;
  }

  .bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 99px;
    transition: width 150ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
    box-shadow: 0 0 5px 1px var(--accent-glow);
  }

  /* Peak-hold marker — thin vertical tick that fades */
  .bar-peak {
    position: absolute;
    top: -3px;
    width: 2px;
    height: 9px;
    background: var(--accent);
    border-radius: 1px;
    transform: translateX(-50%);
    transition:
      opacity 700ms ease-out,
      left 150ms ease-out;
  }
</style>
