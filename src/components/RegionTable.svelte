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

  const totalRegions = config.regions.length
  const pendingCount = $derived(loading ? totalRegions - regions.length : 0)

  function fmt(n: number | null, unit = '') {
    if (n === null) return '—'
    return n.toFixed(n >= 100 ? 0 : 1) + (unit ? ' ' + unit : '')
  }
</script>

<div class="container">
  <div class="section-label">By Region</div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Region</th>
          <th>↓ Down</th>
          <th>↑ Up</th>
          <th>Ping</th>
        </tr>
      </thead>
      <tbody>
        {#each regions as region}
          <tr class:error={!!region.error}>
            <td class="region-name">{region.name}</td>
            {#if region.error}
              <td colspan="3" class="error-msg">Test failed</td>
            {:else}
              <td>{fmt(region.downloadMbps)} <span class="unit">Mbps</span></td>
              <td>{fmt(region.uploadMbps)} <span class="unit">Mbps</span></td>
              <td>{fmt(region.latencyMs)} <span class="unit">ms</span></td>
            {/if}
          </tr>
        {/each}
        {#each Array(pendingCount) as _, i}
          <tr class="pending">
            <td><span class="skeleton"></span></td>
            <td><span class="skeleton short"></span></td>
            <td><span class="skeleton short"></span></td>
            <td><span class="skeleton short"></span></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .container {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem;
    overflow: hidden;
  }

  .section-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
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
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--subtext);
    padding: 0 0.5rem 0.625rem;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  th:not(:first-child) {
    text-align: right;
  }

  td {
    padding: 0.625rem 0.5rem;
    color: var(--text);
    border-bottom: 1px solid var(--border);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  td:not(:first-child) {
    text-align: right;
  }

  tr:last-child td {
    border-bottom: none;
  }

  .region-name {
    font-weight: 500;
  }

  .unit {
    font-size: 0.7rem;
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

  .skeleton {
    display: inline-block;
    height: 0.875rem;
    width: 4rem;
    background: var(--border);
    border-radius: 4px;
    animation: pulse 1.4s ease-in-out infinite;
  }

  .skeleton.short {
    width: 2.5rem;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4 }
    50% { opacity: 0.9 }
  }
</style>
