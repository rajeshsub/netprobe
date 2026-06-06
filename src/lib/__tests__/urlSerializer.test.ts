import { describe, it, expect } from 'vitest'
import { encode, decode } from '../urlSerializer'
import type { TestResults } from '../urlSerializer'

const sample: TestResults = {
  downloadMbps: 450.2,
  uploadMbps: 120.5,
  latencyMs: 12.3,
  jitterMs: 3.1,
  bufferBloatDelta: 145,
  bufferBloatGrade: 'C',
  nearestRegion: 'mlab1-lga05.mlab-oti.measurement-lab.org',
  regions: [
    { name: 'US East', downloadMbps: 450.2, uploadMbps: 120.5, latencyMs: 12.3, error: null },
    { name: 'EU West', downloadMbps: 380.1, uploadMbps: 95.0, latencyMs: 45.0, error: null },
    { name: 'Asia East', downloadMbps: null, uploadMbps: null, latencyMs: null, error: 'failed' },
  ],
  timestamp: 1748600000000,
  healthChecks: null,
}

describe('encode / decode round-trip', () => {
  it('round-trips a complete result', () => {
    const decoded = decode(encode(sample))
    expect(decoded).not.toBeNull()
    expect(decoded!.downloadMbps).toBeCloseTo(450.2, 0)
    expect(decoded!.uploadMbps).toBeCloseTo(120.5, 0)
    expect(decoded!.latencyMs).toBeCloseTo(12.3, 0)
    expect(decoded!.jitterMs).toBeCloseTo(3.1, 0)
    expect(decoded!.bufferBloatGrade).toBe('C')
    expect(decoded!.nearestRegion).toBe(sample.nearestRegion)
    expect(decoded!.timestamp).toBe(sample.timestamp)
  })

  it('preserves region data', () => {
    const decoded = decode(encode(sample))!
    expect(decoded.regions).toHaveLength(3)
    expect(decoded.regions[0]!.name).toBe('US East')
    expect(decoded.regions[2]!.error).toBe('failed')
  })

  it('handles hash prefix in decode', () => {
    const hash = '#' + encode(sample)
    expect(decode(hash)).not.toBeNull()
  })

  it('returns null for empty string', () => {
    expect(decode('')).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(decode('not=valid&data=here')).toBeNull()
  })

  it('returns null for wrong version', () => {
    const encoded = encode(sample).replace('v=1', 'v=2')
    expect(decode(encoded)).toBeNull()
  })

  it('returns null when required numbers are missing', () => {
    expect(decode('v=1&dl=abc&ul=120')).toBeNull()
  })

  it('round-trips all buffer bloat grades', () => {
    for (const grade of ['A', 'B', 'C', 'D', 'F'] as const) {
      const result = decode(encode({ ...sample, bufferBloatGrade: grade }))
      expect(result!.bufferBloatGrade).toBe(grade)
    }
  })

  it('round-trips edge case speeds (0 Mbps)', () => {
    const result = decode(encode({ ...sample, downloadMbps: 0, uploadMbps: 0 }))
    expect(result!.downloadMbps).toBe(0)
  })

  it('round-trips optional health check fields', () => {
    const withHealth: TestResults = {
      ...sample,
      healthChecks: {
        isp: 'Comcast',
        asn: 'AS7922',
        city: 'San Jose',
        connectionType: '4g',
        effectiveConnectionType: '4g',
        webrtcLeakDetected: false,
        webrtcIps: [],
        packetLossPercent: 1.5,
        dnsTimeMs: 23,
        cdnLatencies: [{ name: 'Cloudflare', latencyMs: 12 }],
      },
    }
    const decoded = decode(encode(withHealth))
    expect(decoded).not.toBeNull()
    expect(decoded!.healthChecks).not.toBeNull()
    expect(decoded!.healthChecks!.isp).toBe('Comcast')
    expect(decoded!.healthChecks!.asn).toBe('AS7922')
    expect(decoded!.healthChecks!.webrtcLeakDetected).toBe(false)
    expect(decoded!.healthChecks!.packetLossPercent).toBeCloseTo(1.5, 0)
    expect(decoded!.healthChecks!.dnsTimeMs).toBe(23)
    expect(decoded!.healthChecks!.cdnLatencies).toHaveLength(1)
    expect(decoded!.healthChecks!.cdnLatencies![0]!.name).toBe('Cloudflare')
  })

  it('round-trips webrtcLeakDetected = true', () => {
    const withLeak: TestResults = {
      ...sample,
      healthChecks: {
        isp: 'Test',
        asn: null,
        city: null,
        connectionType: null,
        effectiveConnectionType: null,
        webrtcLeakDetected: true,
        webrtcIps: ['1.2.3.4'],
        packetLossPercent: null,
        dnsTimeMs: null,
        cdnLatencies: null,
      },
    }
    const decoded = decode(encode(withLeak))
    expect(decoded!.healthChecks!.webrtcLeakDetected).toBe(true)
  })

  it('returns null for completely empty hash', () => {
    expect(decode('#')).toBeNull()
  })

  it('missing region string produces empty regions array', () => {
    // Build a minimal valid query string without r= param
    const encoded = encode({ ...sample, regions: [] })
    const decoded = decode(encoded)
    expect(decoded!.regions).toEqual([])
  })

  it('error regions round-trip correctly', () => {
    const onlyError: TestResults = {
      ...sample,
      regions: [
        { name: 'US East', downloadMbps: null, uploadMbps: null, latencyMs: null, error: 'failed' },
      ],
    }
    const decoded = decode(encode(onlyError))!
    expect(decoded.regions[0]!.error).toBe('failed')
    expect(decoded.regions[0]!.latencyMs).toBeNull()
  })
})
