<script lang="ts">
  let {
    value,
    label,
    unit,
    icon,
    active = false,
  }: {
    value: number
    label: string
    unit: string
    icon: string
    active?: boolean
  } = $props()

  let displayed = $state(0)

  $effect(() => {
    if (value > displayed || value === 0) displayed = value
  })
</script>

<div class="gauge" class:active>
  <div class="icon">{icon}</div>
  <div class="value">{displayed < 1 && displayed > 0 ? displayed.toFixed(0) : displayed >= 100 ? displayed.toFixed(0) : displayed.toFixed(1)}</div>
  <div class="unit">{unit}</div>
  <div class="label">{label}</div>
</div>

<style>
  .gauge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1.25rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    transition: border-color 0.3s;
    min-width: 0;
  }

  .gauge.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent), 0 0 16px rgba(0, 229, 255, 0.08);
  }

  .icon {
    font-size: 1rem;
    color: var(--accent);
    opacity: 0.8;
  }

  .value {
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text);
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .unit {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--accent);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .label {
    font-size: 0.7rem;
    color: var(--subtext);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
