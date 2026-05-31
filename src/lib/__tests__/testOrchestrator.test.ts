import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockMeasureBufferBloat } = vi.hoisted(() => ({
  mockMeasureBufferBloat: vi.fn(),
}))

vi.mock('../../config', () => ({
  config: {
    locateApiUrl: 'https://locate.measurementlab.net/v2/nearest/ndt/ndt7',
    clientName: 'netprobe',
    clientVersion: '1.0.0',
    workerBase: '/',
    regions: [
      { name: 'US East',   hostname: 'speedtest.newark.linode.com' },
      { name: 'US West',   hostname: 'speedtest.fremont.linode.com' },
      { name: 'EU West',   hostname: 'speedtest.london.linode.com' },
      { name: 'Asia East', hostname: 'speedtest.tokyo2.linode.com' },
      { name: 'Oceania',   hostname: 'speedtest.sydney.linode.com' },
    ],
  },
}))

vi.mock('../ndt7Engine', () => ({
  runTest: vi.fn(),
  runTestDirect: vi.fn(),
  buildDirectUrlMap: vi.fn((h: string) => ({ '///ndt/v7/download': `wss://${h}/ndt/v7/download` })),
}))
vi.mock('../bufferBloatDetector', () => ({
  measureBufferBloat: mockMeasureBufferBloat,
  computeBufferBloat: vi.fn(),
  gradeFromDelta: vi.fn(),
}))
vi.mock('../regionSelector', () => ({
  buildPingUrl: (h: string) => `https://${h}/favicon.ico`,
  getGlobalRegions: () => [
    { name: 'US East',   hostname: 'speedtest.newark.linode.com' },
    { name: 'US West',   hostname: 'speedtest.fremont.linode.com' },
    { name: 'EU West',   hostname: 'speedtest.london.linode.com' },
    { name: 'Asia East', hostname: 'speedtest.tokyo2.linode.com' },
    { name: 'Oceania',   hostname: 'speedtest.sydney.linode.com' },
  ],
  selectServers: vi.fn(),
}))

import { runFullTest } from '../testOrchestrator'
import type { ProviderFn, ProviderCallbacks } from '../speedProviders'

const bloatResult = { baseline: 12, underLoad: 40, delta: 28, grade: 'B' as const, samples: [12, 40, 38] }

const nearestResult = {
  downloadMbps: 450, uploadMbps: 120, latencyMs: 12, jitterMs: 3,
  serverHostname: 'speedtest.newark.linode.com',
}

type ProviderCbs = ProviderCallbacks

function makeNearestProvider(impl: (cb: ProviderCbs) => Promise<typeof nearestResult>): ProviderFn {
  return impl as unknown as ProviderFn
}

function makeCallbacks() {
  return {
    onPhase: vi.fn(),
    onDownloadSample: vi.fn(),
    onUploadSample: vi.fn(),
    onLatencySample: vi.fn(),
    onRegionComplete: vi.fn(),
    onNearestServer: vi.fn(),
    onError: vi.fn(),
  }
}

// Stub fetch to reject by default so HTTP latency probes fail fast without real network calls.
// Individual tests can override with vi.stubGlobal or a resolved mock for specific scenarios.
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch stubbed in tests')))
  mockMeasureBufferBloat.mockResolvedValue(bloatResult)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runFullTest', () => {
  it('calls nearest provider before global region tests', async () => {
    const order: string[] = []
    const nearestProvider = makeNearestProvider(async (cb) => {
      order.push('nearest')
      cb.onServerChosen?.('speedtest.newark.linode.com')
      cb.onDownloadComplete?.()
      return nearestResult
    })

    await runFullTest(makeCallbacks(), [nearestProvider])
    expect(order[0]).toBe('nearest')
  })

  it('probes all 5 global regions', async () => {
    const nearestProvider = makeNearestProvider(async (cb) => {
      cb.onServerChosen?.('nearest-host')
      cb.onDownloadComplete?.()
      return nearestResult
    })

    const callbacks = makeCallbacks()
    await runFullTest(callbacks, [nearestProvider])
    expect(callbacks.onRegionComplete).toHaveBeenCalledTimes(5)
  })

  it('a failed region does not abort others', async () => {
    const nearestProvider = makeNearestProvider(async (cb) => {
      cb.onServerChosen?.('nearest-host')
      cb.onDownloadComplete?.()
      return nearestResult
    })
    // First region's fetch fails (stubbed globally), the rest also fail — all unavailable,
    // but onRegionComplete is still called for all 5 (no abort).
    const callbacks = makeCallbacks()
    await runFullTest(callbacks, [nearestProvider])
    expect(callbacks.onRegionComplete).toHaveBeenCalledTimes(5)
  })

  it('streams each region result immediately via onRegionComplete', async () => {
    const nearestProvider = makeNearestProvider(async (cb) => {
      cb.onServerChosen?.('nearest-host')
      cb.onDownloadComplete?.()
      return nearestResult
    })

    const callbacks = makeCallbacks()
    await runFullTest(callbacks, [nearestProvider])
    expect(callbacks.onRegionComplete).toHaveBeenCalledTimes(5)
  })

  it('transitions through expected phases in order', async () => {
    const nearestProvider = makeNearestProvider(async (cb) => {
      cb.onServerChosen?.('nearest-host')
      cb.onDownloadComplete?.()
      return nearestResult
    })

    const callbacks = makeCallbacks()
    await runFullTest(callbacks, [nearestProvider])

    const phases = callbacks.onPhase.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(phases).toContain('locating')
    expect(phases).toContain('nearest_download')
    expect(phases).toContain('global')
    expect(phases).toContain('done')
    expect(phases.indexOf('locating')).toBeLessThan(phases.indexOf('done'))
  })

  it('falls back to second provider when first fails', async () => {
    const failingProvider = makeNearestProvider(async () => { throw new Error('rate limited') })
    const successProvider = makeNearestProvider(async (cb) => {
      cb.onServerChosen?.('fallback-host')
      cb.onDownloadComplete?.()
      return nearestResult
    })

    const callbacks = makeCallbacks()
    const result = await runFullTest(callbacks, [failingProvider, successProvider])
    expect(result.downloadMbps).toBe(450)
  })

  it('throws when all providers fail', async () => {
    const fail = makeNearestProvider(async () => { throw new Error('all down') })
    await expect(runFullTest(makeCallbacks(), [fail])).rejects.toThrow()
  })

  it('global regions are marked unavailable when HTTP probe fails', async () => {
    const nearestProvider = makeNearestProvider(async (cb) => {
      cb.onServerChosen?.('nearest-host')
      cb.onDownloadComplete?.()
      return nearestResult
    })
    // fetch is already stubbed to reject globally

    const callbacks = makeCallbacks()
    await runFullTest(callbacks, [nearestProvider])

    const regions = callbacks.onRegionComplete.mock.calls.map((c: unknown[]) => c[0] as { error: string | null })
    expect(regions.every(r => r.error === 'unavailable')).toBe(true)
    expect(regions).toHaveLength(5)
  })

  it('global regions show latency and nearest-server speed when HTTP probe succeeds', async () => {
    const nearestProvider = makeNearestProvider(async (cb) => {
      cb.onServerChosen?.('nearest-host')
      cb.onDownloadComplete?.()
      return nearestResult
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    const callbacks = makeCallbacks()
    await runFullTest(callbacks, [nearestProvider])

    type R = { error: string | null; latencyMs: number | null; downloadMbps: number | null; uploadMbps: number | null }
    const regions = callbacks.onRegionComplete.mock.calls.map((c: unknown[]) => c[0] as R)
    expect(regions).toHaveLength(5)
    expect(regions.every(r => r.error === null)).toBe(true)
    expect(regions.every(r => r.latencyMs !== null)).toBe(true)
    expect(regions.every(r => r.downloadMbps === nearestResult.downloadMbps)).toBe(true)
    expect(regions.every(r => r.uploadMbps === nearestResult.uploadMbps)).toBe(true)
  })
})
