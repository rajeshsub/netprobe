import { runTest } from './ndt7Engine'
import { measureBufferBloat } from './bufferBloatDetector'
import { buildPingUrl, getGlobalRegions } from './regionSelector'
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

export async function runFullTest(callbacks: OrchestratorCallbacks): Promise<TestResults> {
  callbacks.onPhase('locating')

  let bufferBloat: BufferBloatResult = { baseline: 0, underLoad: 0, delta: 0, grade: 'A', samples: [] }
  let pingUrl = ''
  let downloadResolve: (() => void) | null = null
  const downloadDone = new Promise<void>(resolve => { downloadResolve = resolve })

  const nearestResult = await runTest(null, {
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
    onError: (msg) => callbacks.onError(msg),
  })

  callbacks.onPhase('global')

  const regionResults = await Promise.allSettled(
    getGlobalRegions().map(region =>
      runTest(region.hostname, {
        onError: () => {},
      }).then(result => {
        if (result.downloadMbps === 0 && result.uploadMbps === 0) throw new Error('no data')
        return {
          name: region.name,
          downloadMbps: result.downloadMbps,
          uploadMbps: result.uploadMbps,
          latencyMs: result.latencyMs,
          error: null,
        } satisfies RegionResult
      }).catch((): RegionResult => ({
        name: region.name,
        downloadMbps: null,
        uploadMbps: null,
        latencyMs: null,
        error: 'failed',
      }))
    )
  )

  const regions: RegionResult[] = regionResults.map(r =>
    r.status === 'fulfilled' ? r.value : { name: '', downloadMbps: null, uploadMbps: null, latencyMs: null, error: 'failed' }
  )

  regions.forEach(r => callbacks.onRegionComplete(r))

  const successfulRegions = regions.filter(r => r.downloadMbps !== null)
  const avgDownload = successfulRegions.length
    ? successfulRegions.reduce((a, r) => a + (r.downloadMbps ?? 0), 0) / successfulRegions.length
    : nearestResult.downloadMbps

  const results: TestResults = {
    downloadMbps: nearestResult.downloadMbps,
    uploadMbps: nearestResult.uploadMbps,
    latencyMs: nearestResult.latencyMs,
    jitterMs: nearestResult.jitterMs,
    bufferBloatDelta: bufferBloat.delta,
    bufferBloatGrade: bufferBloat.grade,
    nearestRegion: nearestResult.serverHostname,
    regions,
    timestamp: Date.now(),
  }

  callbacks.onPhase('done')
  return results
}
