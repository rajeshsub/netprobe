<script lang="ts">
  import LatencySparkline from './LatencySparkline.svelte'
  import type { BufferBloatGrade } from '../lib/bufferBloatDetector'

  let {
    grade,
    delta,
    samples,
    active = false,
  }: {
    grade: BufferBloatGrade
    delta: number
    samples: number[]
    active?: boolean
  } = $props()

  const gradeColor: Record<BufferBloatGrade, string> = {
    A: '#10b981',
    B: '#00e5ff',
    C: '#f59e0b',
    D: '#f97316',
    F: '#ef4444',
  }

  const hasData = $derived(samples.length > 0)
</script>

<div class="panel" class:active>
  <div class="header">
    <span class="section-label">Buffer Bloat</span>
    {#if hasData}
      <span class="grade" style="color: {gradeColor[grade]}">{grade}</span>
      <span class="delta">+{Math.round(delta)}ms under load</span>
    {:else}
      <span class="grade evaluating">—</span>
      <span class="delta">Evaluating...</span>
    {/if}
  </div>
  {#if hasData}
    <LatencySparkline {samples} />
  {:else}
    <div class="placeholder">Latency graph draws live during download test</div>
  {/if}
</div>

<style>
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem;
    transition: border-color 0.3s;
  }

  .panel.active {
    border-color: var(--accent);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.875rem;
    flex-wrap: wrap;
  }

  .section-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--subtext);
    flex: 1;
  }

  .grade {
    font-size: 2rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.03em;
  }

  .grade.evaluating {
    color: var(--subtext);
  }

  .delta {
    font-size: 0.85rem;
    color: var(--subtext);
    font-variant-numeric: tabular-nums;
  }

  .placeholder {
    height: 110px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    color: var(--subtext);
    border: 1px dashed var(--border);
    border-radius: 8px;
  }
</style>
