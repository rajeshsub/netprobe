<script lang="ts">
  export type Verdict = 'good' | 'warning' | 'poor' | 'info' | 'unavailable'

  let {
    title,
    value = null,
    unit,
    verdict,
    detail,
    loading = false,
  }: {
    title: string
    value?: string | null
    unit?: string
    verdict?: Verdict
    detail?: string
    loading?: boolean
  } = $props()

  const verdictLabel: Record<Exclude<Verdict, 'info' | 'unavailable'>, string> = {
    good: 'Good',
    warning: 'Fair',
    poor: 'Poor',
  }
</script>

<div class="card" class:unavailable={verdict === 'unavailable'}>
  <div class="card-title">{title}</div>

  {#if loading}
    <div class="skeleton-value"></div>
    <div class="skeleton-detail"></div>
  {:else if verdict === 'unavailable'}
    <div class="card-value muted">—</div>
    <div class="card-detail muted">Unavailable</div>
  {:else}
    <div class="card-value">
      {value ?? '—'}
      {#if unit && value !== null}<span class="unit">{unit}</span>{/if}
    </div>
    {#if detail}
      <div class="card-detail">{detail}</div>
    {/if}
    {#if verdict && verdict !== 'info'}
      <div class="verdict verdict-{verdict}">{verdictLabel[verdict]}</div>
    {/if}
  {/if}
</div>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    transition: border-color 0.2s;
  }

  .card.unavailable {
    opacity: 0.5;
  }

  .card-title {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--subtext);
    margin-bottom: 0.25rem;
  }

  .card-value {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-value.muted {
    color: var(--subtext);
  }

  .unit {
    font-size: 0.72rem;
    font-weight: 400;
    color: var(--subtext);
    margin-left: 2px;
  }

  .card-detail {
    font-size: 0.72rem;
    color: var(--subtext);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 0.1rem;
  }

  .card-detail.muted {
    font-style: italic;
  }

  .verdict {
    margin-top: 0.5rem;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    border-radius: 99px;
    align-self: flex-start;
  }

  .verdict-good {
    background: rgba(34, 197, 94, 0.12);
    color: var(--grade-a);
  }

  .verdict-warning {
    background: rgba(234, 179, 8, 0.12);
    color: var(--grade-c);
  }

  .verdict-poor {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
  }

  .skeleton-value {
    height: 1.7rem;
    width: 60%;
    background: var(--border-subtle);
    border-radius: 6px;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  .skeleton-detail {
    height: 0.75rem;
    width: 80%;
    background: var(--border-subtle);
    border-radius: 4px;
    margin-top: 0.25rem;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  @keyframes shimmer {
    0%, 100% { opacity: 0.3 }
    50% { opacity: 0.7 }
  }
</style>
