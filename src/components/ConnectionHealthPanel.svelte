<script lang="ts">
  import type { HealthCheckResults } from '../lib/urlSerializer'
  import HealthCard from './HealthCard.svelte'
  import type { Verdict } from './HealthCard.svelte'

  let {
    health = null,
    loading = false,
  }: {
    health?: HealthCheckResults | null
    loading?: boolean
  } = $props()

  function fmt(n: number | null, dec = 0): string {
    if (n === null) return '—'
    return n >= 100 ? n.toFixed(0) : n.toFixed(dec)
  }

  function packetLossVerdict(pct: number | null): Verdict {
    if (pct === null) return 'unavailable'
    if (pct < 1) return 'good'
    if (pct <= 5) return 'warning'
    return 'poor'
  }

  function dnsVerdict(ms: number | null): Verdict {
    if (ms === null) return 'unavailable'
    if (ms < 50) return 'good'
    if (ms <= 150) return 'warning'
    return 'poor'
  }

  function cdnColor(ms: number): string {
    if (ms < 50) return 'var(--grade-a)'
    if (ms <= 150) return 'var(--grade-c)'
    return '#ef4444'
  }

  function labelConnectionType(ct: string | null, ect: string | null): string | null {
    const ctLabels: Record<string, string> = {
      wifi: 'Wi-Fi',
      cellular: 'Cellular',
      ethernet: 'Ethernet',
      bluetooth: 'Bluetooth',
      wimax: 'WiMAX',
      other: 'Other',
      none: 'None',
      unknown: 'Unknown',
    }
    const ectLabels: Record<string, string> = {
      '4g': '4G / LTE',
      '3g': '3G',
      '2g': '2G',
      'slow-2g': 'Slow 2G',
    }
    if (ct) return ctLabels[ct] ?? ct
    if (ect) return ectLabels[ect] ?? ect
    return null
  }

  const ispValue = $derived(health?.isp ?? null)
  const ispDetail = $derived([health?.asn, health?.city].filter(Boolean).join(' · ') || undefined)
  const connTypeLabel = $derived(
    health ? labelConnectionType(health.connectionType, health.effectiveConnectionType) : null
  )
  const packetLossPct = $derived(health?.packetLossPercent ?? null)
  const dnsMs = $derived(health?.dnsTimeMs ?? null)
  const wrtcLeak = $derived(health?.webrtcLeakDetected ?? null)
  const cdnList = $derived(health?.cdnLatencies ?? null)
</script>

<div class="container">
  <div class="section-label">Connection Health</div>

  <div class="card-grid">
    <HealthCard
      title="ISP"
      value={ispValue}
      verdict={health !== null ? 'info' : undefined}
      detail={ispDetail}
      {loading}
    />

    {#if loading || connTypeLabel !== null}
      <HealthCard
        title="Connection"
        value={connTypeLabel}
        verdict={connTypeLabel ? 'info' : undefined}
        {loading}
      />
    {/if}

    <HealthCard
      title="VPN Leak"
      value={wrtcLeak === null ? null : wrtcLeak ? 'Leak Detected' : 'Protected'}
      verdict={wrtcLeak === null
        ? loading
          ? undefined
          : 'unavailable'
        : wrtcLeak
          ? 'poor'
          : 'good'}
      detail={wrtcLeak ? 'Real IP exposed via WebRTC' : undefined}
      {loading}
    />

    <HealthCard
      title="Packet Loss"
      value={packetLossPct === null ? null : `${fmt(packetLossPct, 1)}%`}
      verdict={packetLossVerdict(packetLossPct)}
      {loading}
    />

    {#if loading || dnsMs !== null}
      <HealthCard
        title="DNS Time"
        value={dnsMs === null ? null : fmt(dnsMs, 0)}
        unit={dnsMs !== null ? 'ms' : undefined}
        verdict={dnsMs === null ? undefined : dnsVerdict(dnsMs)}
        {loading}
      />
    {/if}
  </div>

  {#if loading || cdnList}
    <div class="cdn-panel">
      <div class="cdn-title">CDN Latency</div>
      {#if loading}
        <div class="cdn-skeletons">
          {#each [0, 1, 2, 3] as _}
            <div class="cdn-skeleton"></div>
          {/each}
        </div>
      {:else if cdnList}
        <div class="cdn-rows">
          {#each cdnList as cdn (cdn.name)}
            <div class="cdn-row">
              <span class="cdn-name">{cdn.name}</span>
              <span class="cdn-bar-wrap">
                <span
                  class="cdn-bar"
                  style="width: {Math.min(
                    (cdn.latencyMs / 300) * 100,
                    100
                  )}%; background: {cdnColor(cdn.latencyMs)}"
                ></span>
              </span>
              <span class="cdn-value" style="color: {cdnColor(cdn.latencyMs)}">
                {Math.round(cdn.latencyMs)}<span class="cdn-unit"> ms</span>
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .container {
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-label {
    font-size: 0.63rem;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--subtext);
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  @media (max-width: 600px) {
    .card-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 380px) {
    .card-grid {
      grid-template-columns: 1fr;
    }
  }

  .cdn-panel {
    border-top: 1px solid var(--border-subtle);
    padding-top: 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .cdn-title {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--subtext);
    margin-bottom: 0.25rem;
  }

  .cdn-rows {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .cdn-row {
    display: grid;
    grid-template-columns: 5.5rem 1fr 4.5rem;
    align-items: center;
    gap: 0.75rem;
  }

  .cdn-name {
    font-size: 0.8rem;
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;
  }

  .cdn-bar-wrap {
    height: 4px;
    background: var(--border-subtle);
    border-radius: 99px;
    overflow: hidden;
  }

  .cdn-bar {
    display: block;
    height: 100%;
    border-radius: 99px;
    transition: width 0.5s ease;
  }

  .cdn-value {
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
    font-weight: 600;
  }

  .cdn-unit {
    font-size: 0.65rem;
    font-weight: 400;
    color: var(--subtext);
  }

  .cdn-skeletons {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .cdn-skeleton {
    height: 1rem;
    background: var(--border-subtle);
    border-radius: 4px;
    animation: shimmer 1.4s ease-in-out infinite;
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
