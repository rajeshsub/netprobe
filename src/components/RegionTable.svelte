<script lang="ts">
  import type { RegionResult } from '../lib/urlSerializer'
  import { config } from '../config'

  let {
    regions,
    loading = false,
  }: {
    regions: RegionResult[]
    loading?: boolean
  } = $props()

  const resultMap = $derived(new Map(regions.map((r) => [r.name, r])))

  function fmt(n: number | null): string {
    if (n === null) return '—'
    return n >= 100 ? n.toFixed(0) : n.toFixed(1)
  }
</script>

<div class="container">
  <div class="section-label">By Region</div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Region</th>
          <th>Ping</th>
        </tr>
      </thead>
      <tbody>
        {#each config.regions as region}
          {@const r = resultMap.get(region.name)}
          {#if r}
            <tr class:error={!!r.error}>
              <td class="region-name">{r.name}</td>
              {#if r.error}
                <td class="error-msg">Unavailable</td>
              {:else}
                <td>{fmt(r.latencyMs)} <span class="unit">ms</span></td>
              {/if}
            </tr>
          {:else}
            <tr class="pending">
              <td class="region-name pending-name">
                {region.name}
                {#if loading}<span class="spinner" aria-label="testing"></span>{/if}
              </td>
              <td><span class="skeleton short"></span></td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .container {
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    padding: 1.25rem;
  }

  .section-label {
    font-size: 0.63rem;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--subtext);
    margin-bottom: 0.875rem;
  }

  .table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  th {
    text-align: left;
    font-size: 0.65rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--subtext);
    padding: 0 0.5rem 0.625rem;
    border-bottom: 1px solid var(--border-subtle);
    white-space: nowrap;
  }

  th:last-child {
    text-align: right;
  }

  td {
    padding: 0.6rem 0.5rem;
    color: var(--text);
    border-bottom: 1px solid var(--border-subtle);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  td:last-child {
    text-align: right;
  }
  tr:last-child td {
    border-bottom: none;
  }

  .region-name {
    font-weight: 500;
  }

  .pending-name {
    color: var(--subtext);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .unit {
    font-size: 0.68rem;
    color: var(--subtext);
    margin-left: 1px;
  }

  tr.error td {
    color: var(--subtext);
  }

  .error-msg {
    font-size: 0.8rem;
    color: var(--subtext);
    font-style: italic;
  }

  .spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--border-subtle);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .skeleton {
    display: inline-block;
    height: 0.75rem;
    background: var(--border-subtle);
    border-radius: 4px;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  .skeleton.short {
    width: 2.5rem;
  }

  @keyframes shimmer {
    0%,
    100% {
      opacity: 0.3;
    }
    50% {
      opacity: 0.7;
    }
  }
</style>
