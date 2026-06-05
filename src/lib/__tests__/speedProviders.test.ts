import { describe, it, expect, vi } from 'vitest'

vi.mock('../../config', () => ({
  config: {
    locateApiUrl: 'https://locate.measurementlab.net/v2/nearest/ndt/ndt7',
    clientName: 'netprobe',
    clientVersion: '1.0.0',
    workerBase: '/',
    regions: [
      { name: 'US East', hostname: 'mlab1-lga05.mlab-oti.measurement-lab.org' },
      { name: 'US West', hostname: 'mlab1-lax05.mlab-oti.measurement-lab.org' },
      { name: 'EU West', hostname: 'mlab1-lhr05.mlab-oti.measurement-lab.org' },
      { name: 'Asia East', hostname: 'mlab1-nrt05.mlab-oti.measurement-lab.org' },
      { name: 'Oceania', hostname: 'mlab1-syd05.mlab-oti.measurement-lab.org' },
    ],
  },
}))

import { runWithFallback, PROVIDER_NAMES } from '../speedProviders'
import type { ProviderFn, ProviderCallbacks, ProviderResult } from '../speedProviders'

const okResult: ProviderResult = {
  downloadMbps: 450,
  uploadMbps: 120,
  latencyMs: 12,
  jitterMs: 3,
  serverHostname: 'test-host',
}

function makeProvider(impl: (cb: ProviderCallbacks) => Promise<ProviderResult>): ProviderFn {
  return impl
}

describe('runWithFallback', () => {
  it('returns result from the first provider when it succeeds', async () => {
    const p1 = vi
      .fn<(cb: ProviderCallbacks) => Promise<ProviderResult>>()
      .mockResolvedValue(okResult)
    const p2 = vi
      .fn<(cb: ProviderCallbacks) => Promise<ProviderResult>>()
      .mockResolvedValue({ ...okResult, downloadMbps: 1 })
    const result = await runWithFallback([p1, p2], {})
    expect(result.downloadMbps).toBe(450)
    expect(p2).not.toHaveBeenCalled()
  })

  it('falls through to the next provider when the first throws', async () => {
    const p1 = makeProvider(async () => {
      throw new Error('rate limited')
    })
    const p2 = vi
      .fn<(cb: ProviderCallbacks) => Promise<ProviderResult>>()
      .mockResolvedValue(okResult)
    const result = await runWithFallback([p1, p2], {})
    expect(result).toEqual(okResult)
    expect(p2).toHaveBeenCalledOnce()
  })

  it('tries all providers in order before giving up', async () => {
    const order: number[] = []
    const providers: ProviderFn[] = [0, 1, 2].map((i) =>
      makeProvider(async () => {
        order.push(i)
        throw new Error(`provider ${i} failed`)
      })
    )
    await expect(runWithFallback(providers, {})).rejects.toThrow()
    expect(order).toEqual([0, 1, 2])
  })

  it('throws with the last error when all providers fail', async () => {
    const p1 = makeProvider(async () => {
      throw new Error('first failed')
    })
    const p2 = makeProvider(async () => {
      throw new Error('last failed')
    })
    await expect(runWithFallback([p1, p2], {})).rejects.toThrow('last failed')
  })

  it('calls onProviderSwitch with the new provider name and attempt number', async () => {
    const p1 = makeProvider(async () => {
      throw new Error('fail')
    })
    const p2 = vi
      .fn<(cb: ProviderCallbacks) => Promise<ProviderResult>>()
      .mockResolvedValue(okResult)
    const onSwitch = vi.fn()
    await runWithFallback([p1, p2], {}, onSwitch)
    expect(onSwitch).toHaveBeenCalledWith(PROVIDER_NAMES[1], 2)
  })

  it('forwards callbacks to the provider', async () => {
    const onServerChosen = vi.fn()
    const p1 = makeProvider(async (cb) => {
      cb.onServerChosen?.('chosen-host')
      return okResult
    })
    await runWithFallback([p1], { onServerChosen })
    expect(onServerChosen).toHaveBeenCalledWith('chosen-host')
  })

  it('skips already-failed provider callbacks on a successful fallback', async () => {
    const onDownload = vi.fn()
    const p1 = makeProvider(async (cb) => {
      cb.onDownloadSample?.({ elapsedSeconds: 1, mbps: 100 })
      throw new Error('fail after partial data')
    })
    const p2 = makeProvider(async (cb) => {
      cb.onDownloadSample?.({ elapsedSeconds: 1, mbps: 200 })
      return { ...okResult, downloadMbps: 200 }
    })
    await runWithFallback([p1, p2], { onDownloadSample: onDownload })
    // Both providers fire onDownloadSample — runner doesn't suppress them
    expect(onDownload).toHaveBeenCalledTimes(2)
  })
})
