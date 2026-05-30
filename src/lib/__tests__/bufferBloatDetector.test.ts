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
  it('calculates delta as underLoad minus baseline', () => {
    const result = computeBufferBloat([10, 10, 10], [100, 100, 100])
    expect(result.baseline).toBeCloseTo(10)
    expect(result.underLoad).toBeCloseTo(100)
    expect(result.delta).toBeCloseTo(90)
    expect(result.grade).toBe('D')
  })

  it('clamps delta to 0 when underLoad is less than baseline', () => {
    const result = computeBufferBloat([100], [50])
    expect(result.delta).toBe(0)
    expect(result.grade).toBe('A')
  })

  it('includes all load samples in the result', () => {
    const loadSamples = [10, 20, 30]
    const result = computeBufferBloat([10], loadSamples)
    expect(result.samples).toEqual(loadSamples)
  })

  it('returns A grade for near-zero delta', () => {
    const result = computeBufferBloat([12, 13, 12], [14, 13, 15])
    expect(result.grade).toBe('A')
  })

  it('handles single-element arrays', () => {
    const result = computeBufferBloat([5], [150])
    expect(result.delta).toBeCloseTo(145)
    expect(result.grade).toBe('D')
  })
})
