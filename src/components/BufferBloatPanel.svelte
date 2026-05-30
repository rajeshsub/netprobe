<script lang="ts">
  import LatencySparkline from './LatencySparkline.svelte'
  import type { BufferBloatGrade } from '../lib/bufferBloatDetector'

  let {
    grade,
    delta,
    samples,
    active = false,
    done = false,
  }: {
    grade: BufferBloatGrade
    delta: number
    samples: number[]
    active?: boolean
    done?: boolean
  } = $props()

  const gradeColor: Record<BufferBloatGrade, string> = {
    A: 'var(--grade-a)',
    B: 'var(--grade-b)',
    C: 'var(--grade-c)',
    D: 'var(--grade-d)',
    F: 'var(--grade-f)',
  }

  const gradeDesc: Record<BufferBloatGrade, string> = {
    A: 'No bufferbloat. Near-perfect responsiveness under load.',
    B: 'Minor bufferbloat. Real-time apps mostly unaffected.',
    C: 'Moderate bufferbloat. Video calls may stutter under load.',
    D: 'Heavy bufferbloat. Gaming and calls will suffer.',
    F: 'Severe bufferbloat. Unusable for real-time applications under load.',
  }

  const gradeRange: Record<BufferBloatGrade, string> = {
    A: '≤5ms',
    B: '5–30ms',
    C: '30–60ms',
    D: '60–200ms',
    F: '>200ms',
  }

  const allGrades: BufferBloatGrade[] = ['A', 'B', 'C', 'D', 'F']

  let showInfo = $state(false)
  const hasData = $derived(samples.length > 0)
</script>

<div class="panel" class:active>
  <div class="top">
    <div class="grade-col">
      <span class="section-label">Buffer Bloat</span>
      {#if done}
        <span class="grade" style="color: {gradeColor[grade]}">{grade}</span>
        <span class="delta">+{Math.round(delta)}ms under load</span>
      {:else}
        <span class="grade evaluating">—</span>
        <span class="delta">Evaluating...</span>
      {/if}

      <!-- Grade scale chips -->
      <div class="grade-scale">
        {#each allGrades as g}
          <span
            class="chip"
            class:current={done && g === grade}
            style={done && g === grade ? `background:${gradeColor[g]}22;color:${gradeColor[g]};border-color:${gradeColor[g]}` : ''}
          >{g}</span>
        {/each}
        <button
          class="info-btn"
          onclick={() => showInfo = !showInfo}
          aria-label="Grade info"
          aria-expanded={showInfo}
        >ⓘ</button>
      </div>
    </div>

    <div class="graph-col">
      {#if hasData}
        <LatencySparkline {samples} />
      {:else}
        <div class="placeholder">Live latency graph draws during download test</div>
      {/if}
    </div>
  </div>

  {#if done && showInfo}
    <div class="info-box">
      <p class="info-current">{gradeDesc[grade]}</p>
      <table class="grade-table">
        <tbody>
          {#each allGrades as g}
            <tr class:highlight={g === grade}>
              <td class="gt-grade" style="color:{gradeColor[g]}">{g}</td>
              <td class="gt-range">{gradeRange[g]} added</td>
              <td class="gt-desc">{gradeDesc[g]}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .panel {
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    padding: 1.25rem 1.5rem;
    transition: border-color 0.25s, box-shadow 0.25s;
  }

  .panel.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent), 0 0 24px var(--accent-glow);
  }

  .top {
    display: flex;
    gap: 1.5rem;
    align-items: center;
  }

  .grade-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    flex-shrink: 0;
    min-width: 72px;
  }

  .graph-col {
    flex: 1;
    min-width: 0;
  }

  .section-label {
    font-size: 0.63rem;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--subtext);
    white-space: nowrap;
  }

  .grade {
    font-size: 3.75rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .grade.evaluating {
    color: var(--subtext);
    opacity: 0.4;
  }

  .delta {
    font-size: 0.72rem;
    color: var(--subtext);
    font-variant-numeric: tabular-nums;
    text-align: center;
    white-space: nowrap;
  }

  .grade-scale {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-top: 0.35rem;
  }

  .chip {
    font-size: 0.6rem;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 4px;
    border: 1px solid var(--border-subtle);
    color: var(--subtext);
    letter-spacing: 0.02em;
    line-height: 1.4;
  }

  .chip.current {
    font-weight: 800;
  }

  .info-btn {
    background: none;
    border: none;
    font-size: 0.7rem;
    color: var(--subtext);
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    opacity: 0.6;
    transition: opacity 0.15s;
  }

  .info-btn:hover {
    opacity: 1;
    color: var(--accent);
  }

  .placeholder {
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
    color: var(--subtext);
    border: 1px dashed var(--border-subtle);
    border-radius: 8px;
    opacity: 0.6;
  }

  .info-box {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-subtle);
  }

  .info-current {
    font-size: 0.83rem;
    color: var(--text);
    margin-bottom: 0.75rem;
    font-weight: 500;
  }

  .grade-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
  }

  .grade-table tr {
    border-bottom: 1px solid var(--border-subtle);
  }

  .grade-table tr:last-child {
    border-bottom: none;
  }

  .grade-table tr.highlight td {
    background: var(--accent-dim);
  }

  .gt-grade {
    font-weight: 800;
    font-size: 0.9rem;
    padding: 0.35rem 0.6rem 0.35rem 0;
    width: 1.5rem;
  }

  .gt-range {
    color: var(--subtext);
    padding: 0.35rem 0.75rem 0.35rem 0;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .gt-desc {
    color: var(--subtext);
    padding: 0.35rem 0;
    line-height: 1.4;
  }

  @media (max-width: 480px) {
    .top {
      flex-direction: column;
      align-items: stretch;
    }

    .grade-col {
      flex-direction: row;
      align-items: center;
      gap: 0.75rem;
      min-width: unset;
    }

    .grade {
      font-size: 2.75rem;
    }

    .grade-scale {
      margin-top: 0;
    }

    .gt-desc {
      display: none;
    }
  }
</style>
