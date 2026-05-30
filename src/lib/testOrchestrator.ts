import { runTest } from './ndt7Engine'
import { computeBufferBloat } from './bufferBloatDetector'
import { getGlobalRegions } from './regionSelector'
import type { BufferBloatResult } from './bufferBloatDetector'
import type { RegionResult, TestResults } from './urlSerializer'
import type { SpeedSample } from './ndt7Engine'

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

const BASELINE_COUNT = 4  // first N server RTT readings treated as baseline

export async function runFullTest(callbacks: OrchestratorCallbacks): Promise<TestResults> {
  callbacks.onPhase('locating')

  const rttSamples: number[] = []
  let bufferBloat: BufferBloatResult = { baseline: 0, underLoad: 0, delta: 0, grade: 'A', samples: [] }

  const nearestResult = await runTest(null, {
    onServerChosen: (hostname) => {
      callbacks.onNearestServer(hostname)
      callbacks.onPhase('nearest_download')
    },
    onDownloadSample: (s) => callbacks.onDownloadSample(s),
    onLatencySample: (ms) => {
      rttSamples.push(ms)
      callbacks.onLatencySample(ms)
    },
    onDownloadComplete: () => {
      // Compute buffer bloat now — all RTT samples are in
      const baseline = rttSamples.slice(0, BASELINE_COUNT)
      const underLoad = rttSamples.slice(BASELINE_COUNT)
      bufferBloat = computeBufferBloat(
        baseline.length ? baseline : rttSamples,
        underLoad.length ? underLoad : rttSamples
      )
      callbacks.onPhase('nearest_upload')
    },
    onUploadSample: (s) => callbacks.onUploadSample(s),
    onError: (msg) => callbacks.onError(msg),
  })

  callbacks.onPhase('global')

  const completedRegions: RegionResult[] = []

  await Promise.allSettled(
    getGlobalRegions().map(region =>
      runTest(region.hostname, { onError: () => {} })
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
          return r
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
          return r
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
