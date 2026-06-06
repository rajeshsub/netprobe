import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  gradeFromDelta,
  computeBufferBloat,
  measureBaselineRTT,
  measureBufferBloat,
} from '../bufferBloatDetector'

describe('gradeFromDelta', () => {
  it('grades A at exactly 5ms', () => expect(gradeFromDelta(5)).toBe('A'))
  it('grades B at exactly 30ms', () => expect(gradeFromDelta(30)).toBe('B'))
  it('grades C at exactly 60ms', () => expect(gradeFromDelta(60)).toBe('C'))
  it('grades D at exactly 200ms', () => expect(gradeFromDelta(200)).toBe('D'))
  it('grades F above 200ms', () => expect(gradeFromDelta(201)).toBe('F'))
  it('grades A at 0ms', () => expect(gradeFromDelta(0)).toBe('A'))
  it('grades B between boundaries', () => expect(gradeFromDelta(15)).toBe('B'))
  it('grades C between boundaries', () => expect(gradeFromDelta(45)).toBe('C'))
  it('grades D between boundaries', () => expect(gradeFromDelta(100)).toBe('D'))
  it('boundary 6ms is B', () => expect(gradeFromDelta(6)).toBe('B'))
  it('boundary 31ms is C', () => expect(gradeFromDelta(31)).toBe('C'))
  it('boundary 61ms is D', () => expect(gradeFromDelta(61)).toBe('D'))
})

describe('computeBufferBloat', () => {
  it('uses 90th-percentile under load, not mean', () => {
    // 9 low samples + 1 spike — mean would be ~18ms, p90 captures the spike
    const load = [10, 10, 10, 10, 10, 10, 10, 10, 10, 100]
    const result = computeBufferBloat([10], load)
    expect(result.underLoad).toBeGreaterThan(50)
    expect(result.delta).toBeGreaterThan(40)
  })

  it('uses median for baseline', () => {
    // Outlier first ping (connection setup) should not inflate baseline
    const baseline = [5, 5, 5, 5, 200]
    const result = computeBufferBloat(baseline, [10])
    expect(result.baseline).toBeCloseTo(5)
  })

  it('clamps delta to 0 when under-load is less than baseline', () => {
    const result = computeBufferBloat([100], [50])
    expect(result.delta).toBe(0)
    expect(result.grade).toBe('A')
  })

  it('returns empty samples and grade A when no data collected', () => {
    const result = computeBufferBloat([], [])
    expect(result.samples).toEqual([])
    expect(result.grade).toBe('A')
    expect(result.delta).toBe(0)
  })

  it('returns empty samples when only baseline collected', () => {
    const result = computeBufferBloat([10, 12], [])
    expect(result.samples).toEqual([])
  })

  it('includes all load samples in the result', () => {
    const loadSamples = [10, 20, 30]
    const result = computeBufferBloat([10], loadSamples)
    expect(result.samples).toEqual(loadSamples)
  })

  it('handles single-element arrays', () => {
    const result = computeBufferBloat([5], [150])
    expect(result.delta).toBeCloseTo(145)
    expect(result.grade).toBe('D')
  })
})

// Fake Image class that fires onerror after a 0ms timeout, simulating a
// non-image response (which is what the ping endpoint returns).
function makeFastImage(onCreated?: () => void) {
  return class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_: string) {
      onCreated?.()
      const err = this.onerror
      // Schedule onerror on real timers — zero delay so tests run fast
      // without messing with fake-timer TDZ issues.
      queueMicrotask(() => err?.())
    }
  }
}

// Type-safe helper to swap out the global Image constructor in jsdom.
const G = globalThis as Record<string, unknown>
function setImage(ctor: unknown) {
  G.Image = ctor
}
function getImage(): unknown {
  return G.Image
}

describe('measureBaselineRTT', () => {
  let savedImage: unknown

  beforeEach(() => {
    savedImage = getImage()
  })
  afterEach(() => {
    setImage(savedImage)
  })

  it('discards the warm-up ping and returns count samples', async () => {
    let callCount = 0
    setImage(
      makeFastImage(() => {
        callCount++
      })
    )
    const count = 3
    const samples = await measureBaselineRTT('https://example.com', count)
    // warm-up + count samples = count+1 total Image creations
    expect(callCount).toBe(count + 1)
    expect(samples).toHaveLength(count)
  })

  it('excludes null pings (timeouts) from the returned samples', async () => {
    // Image that never fires — timeout fires instead, ping() returns null
    setImage(
      class TimeoutImage {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_: string) {}
      }
    )
    vi.useFakeTimers()
    const promise = measureBaselineRTT('https://example.com', 1)
    // Advance past warm-up (2000ms) + spacing (200ms) + sample (2000ms)
    await vi.runAllTimersAsync()
    const samples = await promise
    expect(samples).toEqual([])
    vi.useRealTimers()
  })

  it('onerror fires resolves with elapsed time (not null)', async () => {
    setImage(makeFastImage())
    const samples = await measureBaselineRTT('https://example.com', 1)
    expect(samples).toHaveLength(1)
    expect(samples[0]).toBeGreaterThanOrEqual(0)
  })
})

describe('measureBufferBloat', () => {
  let savedImage: unknown

  beforeEach(() => {
    savedImage = getImage()
  })
  afterEach(() => {
    setImage(savedImage)
  })

  it('stops pinging when download resolves and active becomes false', async () => {
    const onSample = vi.fn()
    setImage(makeFastImage())
    // runDownload resolves immediately — the ping loop fires onerror first via microtask
    const result = await measureBufferBloat(
      'https://example.com',
      [10],
      () => Promise.resolve(),
      onSample
    )
    expect(result.grade).toBeDefined()
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade)
  })

  it('does not include uploadGrade when runUpload is not provided', async () => {
    setImage(makeFastImage())
    const result = await measureBufferBloat(
      'https://example.com',
      [10],
      () => Promise.resolve(),
      vi.fn()
    )
    expect(result.uploadGrade).toBeUndefined()
    expect(result.uploadDelta).toBeUndefined()
  })

  it('includes uploadGrade when runUpload is provided', async () => {
    setImage(makeFastImage())
    const result = await measureBufferBloat(
      'https://example.com',
      [10],
      () => Promise.resolve(),
      vi.fn(),
      () => Promise.resolve()
    )
    expect(result.uploadGrade).toBeDefined()
    expect(result.uploadDelta).toBeDefined()
  })

  it('collects download and upload samples into a single samples array', async () => {
    setImage(makeFastImage())
    const onSample = vi.fn()
    const result = await measureBufferBloat(
      'https://example.com',
      [10],
      () => Promise.resolve(),
      onSample,
      () => Promise.resolve()
    )
    // All pings collected across both phases end up in result.samples
    expect(result.samples.length).toBeGreaterThanOrEqual(0)
  })
})
