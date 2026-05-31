import { runTestDirect } from './ndt7Engine'
import { measureBufferBloat } from './bufferBloatDetector'
import { buildPingUrl, getGlobalRegions } from './regionSelector'
import { runWithFallback, DEFAULT_PROVIDERS } from './speedProviders'
import type { BufferBloatResult } from './bufferBloatDetector'
import type { RegionResult, TestResults } from './urlSerializer'
import type { SpeedSample } from './ndt7Engine'
import type { ProviderFn } from './speedProviders'

export type Phase =
  | 'idle'
  | 'locating'
  | 'nearest_download'
  | 'nearest_upload'
  | 'global'
  | 'done'
  | 'error'

export interface OrchestratorCallbacks {
  onPhase(phase: Phase): void
  onDownloadSample(sample: SpeedSample): void
  onUploadSample(sample: SpeedSample): void
  onLatencySample(ms: number): void
  onRegionComplete(result: RegionResult): void
  onNearestServer(hostname: string): void
  onError(msg: string): void
}

export async function runFullTest(
  callbacks: OrchestratorCallbacks,
  providers: ProviderFn[] = DEFAULT_PROVIDERS
): Promise<TestResults> {
  callbacks.onPhase('locating')

  let bufferBloat: BufferBloatResult = { baseline: 0, underLoad: 0, delta: 0, grade: 'A', samples: [] }
  let pingUrl = ''
  let downloadResolve: (() => void) | null = null
  const downloadDone = new Promise<void>(resolve => { downloadResolve = resolve })

  const nearestResult = await runWithFallback(providers, {
    onServerChosen: (hostname) => {
      pingUrl = buildPingUrl(hostname)
      callbacks.onNearestServer(hostname)
      callbacks.onPhase('nearest_download')

      void measureBufferBloat(
        pingUrl,
        () => downloadDone,
        (ms) => callbacks.onLatencySample(ms)
      ).then(result => { bufferBloat = result })
    },
    onDownloadSample: (s) => callbacks.onDownloadSample(s),
    onDownloadComplete: () => {
      downloadResolve?.()
      callbacks.onPhase('nearest_upload')
    },
    onUploadSample: (s) => callbacks.onUploadSample(s),
  })

  callbacks.onPhase('global')

  const completedRegions: RegionResult[] = []

  // Use runTestDirect for all global regions — bypasses the locate API entirely,
  // so a rate-limited locate API cannot block region tests.
  await Promise.allSettled(
    getGlobalRegions().map(region =>
      runTestDirect(region.hostname, { onError: () => {} })
        .then(result => {
          if (result.downloadMbps === 0 && result.uploadMbps === 0) throw new Error('no data')
          const r: RegionResult = {
            name: region.name,
            downloadMbps: result.downloadMbps,
            uploadMbps: result.uploadMbps,
            latencyMs: result.latencyMs,
            error: null,
          }
          completedRegions.push(r)
          callbacks.onRegionComplete(r)
        })
        .catch(() => {
          const r: RegionResult = {
            name: region.name,
            downloadMbps: null,
            uploadMbps: null,
            latencyMs: null,
            error: 'unavailable',
          }
          completedRegions.push(r)
          callbacks.onRegionComplete(r)
        })
    )
  )

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
  }

  callbacks.onPhase('done')
  return results
}
