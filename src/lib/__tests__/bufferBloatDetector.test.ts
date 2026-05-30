import { describe, it, expect } from 'vitest'
import { gradeFromDelta, computeBufferBloat } from '../bufferBloatDetector'

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
