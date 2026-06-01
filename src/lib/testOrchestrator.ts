import { measureBufferBloat } from './bufferBloatDetector'
import { buildPingUrl, getGlobalRegions } from './regionSelector'
import { runWithFallback, DEFAULT_PROVIDERS } from './speedProviders'
import { runEarlyHealthChecks, runLateHealthChecks, combineHealthResults } from './healthChecks/index'
import type { BufferBloatResult } from './bufferBloatDetector'
import type { RegionResult, TestResults, HealthCheckResults } from './urlSerializer'
import type { SpeedSample } from './ndt7Engine'
import type { ProviderFn } from './speedProviders'

// Fallback servers per region from multiple cloud providers.
// Tried in parallel with the primary — if Linode rate-limits or blocks, these
// absorb the failure silently.
const REGION_FALLBACKS: Record<string, string[]> = {
  'US East':   ['speedtest-nyc1.digitalocean.com', 'nj-us-ping.vultr.com',  's3.us-east-1.amazonaws.com'],
  'US West':   ['speedtest-sfo2.digitalocean.com', 'wa-us-ping.vultr.com',  's3.us-west-2.amazonaws.com'],
  'EU West':   ['speedtest-lon1.digitalocean.com', 'lon-gb-ping.vultr.com', 's3.eu-west-1.amazonaws.com'],
  'Asia East': ['speedtest-sgp1.digitalocean.com', 'sgp-sg-ping.vultr.com', 's3.ap-northeast-1.amazonaws.com'],
  'Oceania':   ['speedtest-syd1.digitalocean.com', 'syd-au-ping.vultr.com', 's3.ap-southeast-2.amazonaws.com'],
}

async function pingHost(hostname: string): Promise<number> {
  const latencies: number[] = []
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    try {
      await fetch(`https://${hostname}/?t=${t0}`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      })
      latencies.push(performance.now() - t0)
    } catch { /* skip — timeout or connection refused */ }
    if (i < 2) await new Promise(r => setTimeout(r, 100))
  }
  if (latencies.length === 0) throw new Error(`${hostname}: unreachable`)
  return Math.min(...latencies)
}

// Probes all candidate hostnames in parallel and returns the latency from
// whichever responds first. This handles rate-limiting and geographic
// unavailability of any single provider transparently.
export async function measureRegionLatencyHTTP(hostnames: string[]): Promise<number> {
  return Promise.any(hostnames.map(pingHost))
}

export type Phase =
  | 'idle'
  | 'locating'
  | 'nearest_download'
  | 'nearest_upload'
  | 'global'
  | 'health'
  | 'done'
  | 'error'

export interface OrchestratorCallbacks {
  onPhase(phase: Phase): void
  onDownloadSample(sample: SpeedSample): void
  onUploadSample(sample: SpeedSample): void
  onLatencySample(ms: number): void
  onRegionComplete(result: RegionResult): void
  onNearestServer(hostname: string): void
  onNearestComplete?(latencyMs: number, jitterMs: number): void
  onBufferBloatComplete?(result: BufferBloatResult): void
  onHealthComplete(results: HealthCheckResults): void
  onError(msg: string): void
}

export async function runFullTest(
  callbacks: OrchestratorCallbacks,
  providers: ProviderFn[] = DEFAULT_PROVIDERS
): Promise<TestResults> {
  callbacks.onPhase('locating')

  const earlyHealthPromise = runEarlyHealthChecks()

  let bufferBloat: BufferBloatResult = { baseline: 0, underLoad: 0, delta: 0, grade: 'A', samples: [] }
  let pingUrl = ''
  let downloadResolve: (() => void) | null = null
  let uploadResolve: (() => void) | null = null
  const downloadDone = new Promise<void>(resolve => { downloadResolve = resolve })
  const uploadDone = new Promise<void>(resolve => { uploadResolve = resolve })

  const nearestResult = await runWithFallback(providers, {
    onServerChosen: (hostname) => {
      pingUrl = buildPingUrl(hostname)
      callbacks.onNearestServer(hostname)
      callbacks.onPhase('nearest_download')

      void measureBufferBloat(
        pingUrl,
        () => downloadDone,
        (ms) => callbacks.onLatencySample(ms),
        () => uploadDone,
      ).then(result => {
        bufferBloat = result
        callbacks.onBufferBloatComplete?.(result)
      })
    },
    onDownloadSample: (s) => callbacks.onDownloadSample(s),
    onDownloadComplete: () => {
      downloadResolve?.()
      callbacks.onPhase('nearest_upload')
    },
    onUploadSample: (s) => callbacks.onUploadSample(s),
  })

  uploadResolve?.()
  callbacks.onNearestComplete?.(nearestResult.latencyMs, nearestResult.jitterMs)

  callbacks.onPhase('global')

  const completedRegions: RegionResult[] = []

  await Promise.allSettled(
    getGlobalRegions().map(async region => {
      const fallbacks = REGION_FALLBACKS[region.name] ?? []
      const candidates = [region.hostname, ...fallbacks]
      let r: RegionResult
      try {
        const latencyMs = await measureRegionLatencyHTTP(candidates)
        r = { name: region.name, downloadMbps: null, uploadMbps: null, latencyMs, error: null }
      } catch {
        r = { name: region.name, downloadMbps: null, uploadMbps: null, latencyMs: null, error: 'unavailable' }
      }
      completedRegions.push(r)
      callbacks.onRegionComplete(r)
    })
  )

  callbacks.onPhase('health')

  const regionHostnames = getGlobalRegions().map(r => r.hostname)
  const [earlyHealth, lateHealth] = await Promise.all([
    earlyHealthPromise,
    runLateHealthChecks(regionHostnames),
  ])

  const healthChecks = combineHealthResults(earlyHealth, lateHealth)
  callbacks.onHealthComplete(healthChecks)

  const results: TestResults = {
    downloadMbps: nearestResult.downloadMbps,
    uploadMbps: nearestResult.uploadMbps,
    latencyMs: nearestResult.latencyMs,
    jitterMs: nearestResult.jitterMs,
    bufferBloatDelta: bufferBloat.delta,
    bufferBloatGrade: bufferBloat.grade,
    nearestRegion: nearestResult.serverHostname,
    regions: completedRegions,
    timestamp: Date.now(),
    healthChecks,
  }

  callbacks.onPhase('done')
  return results
}
