import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockRunTestDirect, mockMeasureBufferBloat } = vi.hoisted(() => ({
  mockRunTestDirect: vi.fn(),
  mockMeasureBufferBloat: vi.fn(),
}))

vi.mock('../../config', () => ({
  config: {
    locateApiUrl: 'https://locate.measurementlab.net/v2/nearest/ndt/ndt7',
    clientName: 'netprobe',
    clientVersion: '1.0.0',
    workerBase: '/',
    regions: [
      { name: 'US East',   hostname: 'mlab1-lga05.mlab-oti.measurement-lab.org' },
      { name: 'US West',   hostname: 'mlab1-lax05.mlab-oti.measurement-lab.org' },
      { name: 'EU West',   hostname: 'mlab1-lhr05.mlab-oti.measurement-lab.org' },
      { name: 'Asia East', hostname: 'mlab1-nrt05.mlab-oti.measurement-lab.org' },
      { name: 'Oceania',   hostname: 'mlab1-syd05.mlab-oti.measurement-lab.org' },
    ],
  },
}))

vi.mock('../ndt7Engine', () => ({
  runTest: vi.fn(),
  runTestDirect: mockRunTestDirect,
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
    { name: 'US East',   hostname: 'mlab1-lga05.mlab-oti.measurement-lab.org' },
    { name: 'US West',   hostname: 'mlab1-lax05.mlab-oti.measurement-lab.org' },
    { name: 'EU West',   hostname: 'mlab1-lhr05.mlab-oti.measurement-lab.org' },
    { name: 'Asia East', hostname: 'mlab1-nrt05.mlab-oti.measurement-lab.org' },
    { name: 'Oceania',   hostname: 'mlab1-syd05.mlab-oti.measurement-lab.org' },
  ],
  selectServers: vi.fn(),
}))

import { runFullTest, measureRegionLatencyHTTP } from '../testOrchestrator'
import type { ProviderFn, ProviderCallbacks } from '../speedProviders'

const bloatResult = { baseline: 12, underLoad: 40, delta: 28, grade: 'B' as const, samples: [12, 40, 38] }

const nearestResult = {
  downloadMbps: 450, uploadMbps: 120, latencyMs: 12, jitterMs: 3,
  serverHostname: 'mlab1-lga05.mlab-oti.measurement-lab.org',
}

const regionResult = {
  downloadMbps: 300, uploadMbps: 100, latencyMs: 20, jitterMs: 5,
  serverHostname: 'mlab1-lax05.mlab-oti.measurement-lab.org',
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

beforeEach(() => {
  vi.clearAllMocks()
  // Stub fetch so the HTTP latency fallback fails fast without making real network requests
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch stubbed in tests')))
  mockMeasureBufferBloat.mockResolvedValue(bloatResult)
  mockRunTestDirect.mockResolvedValue(regionResult)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runFullTest', () => {
  it('calls nearest provider before global region tests', async () => {
    const order: string[] = []
    const nearestProvider = makeNearestProvider(async (cb) => {
      order.push('nearest')
      cb.onServerChosen?.('mlab1-lga05.mlab-oti.measurement-lab.org')
      cb.onDownloadComplete?.()
      return nearestResult
    })
    mockRunTestDirect.mockImplementation(async () => { order.push('region'); return regionResult })

    await runFullTest(makeCallbacks(), [nearestProvider])
    expect(order[0]).toBe('nearest')
    expect(order.slice(1).every(o => o === 'region')).toBe(true)
  })

  it('runs all 5 global region tests via runTestDirect', async () => {
    const nearestProvider = makeNearestProvider(async (cb) => {
      cb.onServerChosen?.('nearest-host')
      cb.onDownloadComplete?.()
      return nearestResult
    })

    await runFullTest(makeCallbacks(), [nearestProvider])
    expect(mockRunTestDirect).toHaveBeenCalledTimes(5)
  })

  it('a failed region does not abort others', async () => {
    const nearestProvider = makeNearestProvider(async (cb) => {
      cb.onServerChosen?.('nearest-host')
      cb.onDownloadComplete?.()
      return nearestResult
    })
    mockRunTestDirect
      .mockRejectedValueOnce(new Error('region 1 failed'))
      .mockResolvedValue(regionResult)

    const callbacks = makeCallbacks()
    await runFullTest(callbacks, [nearestProvider])

    const regions = callbacks.onRegionComplete.mock.calls.map((c: unknown[]) => c[0] as { error: string | null })
    expect(regions.some(r => r.error !== null)).toBe(true)
    expect(regions.some(r => r.error === null)).toBe(true)
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

  it('global regions are marked unavailable when runTestDirect and HTTP fallback both fail', async () => {
    const nearestProvider = makeNearestProvider(async (cb) => {
      cb.onServerChosen?.('nearest-host')
      cb.onDownloadComplete?.()
      return nearestResult
    })
    mockRunTestDirect.mockRejectedValue(new Error('server down'))
    // fetch is already stubbed to reject globally via beforeEach

    const callbacks = makeCallbacks()
    await runFullTest(callbacks, [nearestProvider])

    const regions = callbacks.onRegionComplete.mock.calls.map((c: unknown[]) => c[0] as { error: string | null })
    expect(regions.every(r => r.error === 'unavailable')).toBe(true)
    expect(regions).toHaveLength(5)
  })
})
