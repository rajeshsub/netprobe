import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRunTest, mockMeasureBufferBloat } = vi.hoisted(() => ({
  mockRunTest: vi.fn(),
  mockMeasureBufferBloat: vi.fn(),
}))

vi.mock('../../config', () => ({
  config: {
    locateApiUrl: 'https://locate.measurementlab.net/v2/nearest/ndt/ndt7',
    clientName: 'echometer',
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

vi.mock('../ndt7Engine', () => ({ runTest: mockRunTest }))
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

import { runFullTest } from '../testOrchestrator'

const bloatResult = { baseline: 12, underLoad: 40, delta: 28, grade: 'B' as const, samples: [12, 40, 38] }

const nearestResult = {
  downloadMbps: 450, uploadMbps: 120, latencyMs: 12, jitterMs: 3,
  serverHostname: 'mlab1-lga05.mlab-oti.measurement-lab.org',
}

const regionResult = {
  downloadMbps: 300, uploadMbps: 100, latencyMs: 20, jitterMs: 5,
  serverHostname: 'mlab1-lax05.mlab-oti.measurement-lab.org',
}

type RunTestCbs = {
  onServerChosen?: (h: string) => void
  onDownloadComplete?: () => void
  onError?: (m: string) => void
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
  mockMeasureBufferBloat.mockResolvedValue(bloatResult)
})

describe('runFullTest', () => {
  it('runs nearest server test before global tests', async () => {
    const order: string[] = []
    mockRunTest
      .mockImplementationOnce(async (_: null, cbs: RunTestCbs) => {
        order.push('nearest')
        cbs.onServerChosen?.('mlab1-lga05.mlab-oti.measurement-lab.org')
        await new Promise<void>(r => setTimeout(r, 10))
        cbs.onDownloadComplete?.()
        return nearestResult
      })
      .mockImplementation(async () => { order.push('region'); return regionResult })

    await runFullTest(makeCallbacks())
    expect(order[0]).toBe('nearest')
    expect(order.slice(1).every(o => o === 'region')).toBe(true)
  })

  it('runs all 5 global region tests', async () => {
    mockRunTest
      .mockImplementationOnce(async (_: null, cbs: RunTestCbs) => {
        cbs.onServerChosen?.('nearest-host')
        cbs.onDownloadComplete?.()
        return nearestResult
      })
      .mockResolvedValue(regionResult)

    await runFullTest(makeCallbacks())
    expect(mockRunTest).toHaveBeenCalledTimes(6)
  })

  it('a failed region does not abort others', async () => {
    mockRunTest
      .mockImplementationOnce(async (_: null, cbs: RunTestCbs) => {
        cbs.onServerChosen?.('nearest-host')
        cbs.onDownloadComplete?.()
        return nearestResult
      })
      .mockRejectedValueOnce(new Error('region 1 failed'))
      .mockResolvedValue(regionResult)

    const callbacks = makeCallbacks()
    await runFullTest(callbacks)

    const regions = callbacks.onRegionComplete.mock.calls.map((c: unknown[]) => c[0] as { error: string | null })
    expect(regions.some(r => r.error !== null)).toBe(true)
    expect(regions.some(r => r.error === null)).toBe(true)
  })

  it('streams each region result immediately via onRegionComplete', async () => {
    mockRunTest
      .mockImplementationOnce(async (_: null, cbs: RunTestCbs) => {
        cbs.onServerChosen?.('nearest-host')
        cbs.onDownloadComplete?.()
        return nearestResult
      })
      .mockResolvedValue(regionResult)

    const callbacks = makeCallbacks()
    await runFullTest(callbacks)
    expect(callbacks.onRegionComplete).toHaveBeenCalledTimes(5)
  })

  it('transitions through expected phases in order', async () => {
    mockRunTest
      .mockImplementationOnce(async (_: null, cbs: RunTestCbs) => {
        cbs.onServerChosen?.('nearest-host')
        cbs.onDownloadComplete?.()
        return nearestResult
      })
      .mockResolvedValue(regionResult)

    const callbacks = makeCallbacks()
    await runFullTest(callbacks)

    const phases = callbacks.onPhase.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(phases).toContain('locating')
    expect(phases).toContain('nearest_download')
    expect(phases).toContain('global')
    expect(phases).toContain('done')
    expect(phases.indexOf('locating')).toBeLessThan(phases.indexOf('done'))
  })
})
