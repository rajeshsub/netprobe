import type { BufferBloatGrade } from './bufferBloatDetector'

export interface RegionResult {
  name: string
  downloadMbps: number | null
  uploadMbps: number | null
  latencyMs: number | null
  error: string | null
}

export interface CdnLatency {
  name: string
  latencyMs: number
}

export interface HealthCheckResults {
  isp: string | null
  asn: string | null
  city: string | null
  connectionType: string | null
  effectiveConnectionType: string | null
  webrtcLeakDetected: boolean | null
  webrtcIps: string[]
  packetLossPercent: number | null
  dnsTimeMs: number | null
  cdnLatencies: CdnLatency[] | null
}

export interface TestResults {
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
  jitterMs: number
  bufferBloatDelta: number
  bufferBloatGrade: BufferBloatGrade
  nearestRegion: string
  regions: RegionResult[]
  timestamp: number
  healthChecks: HealthCheckResults | null
}

function r(n: number | null, decimals = 1): string {
  return n === null ? '' : n.toFixed(decimals)
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max)
}

export function encode(results: TestResults): string {
  const regionStr = results.regions
    .map((reg) => {
      if (reg.error) return `${encodeURIComponent(reg.name)}:err`
      return `${encodeURIComponent(reg.name)}:${r(reg.downloadMbps)}:${r(reg.uploadMbps)}:${r(reg.latencyMs)}`
    })
    .join(',')

  const params = new URLSearchParams({
    v: '1',
    dl: r(results.downloadMbps),
    ul: r(results.uploadMbps),
    lat: r(results.latencyMs),
    j: r(results.jitterMs),
    bb: r(results.bufferBloatDelta, 0),
    bbg: results.bufferBloatGrade,
    nr: encodeURIComponent(results.nearestRegion),
    ts: String(results.timestamp),
    r: regionStr,
  })

  const h = results.healthChecks
  if (h) {
    if (h.isp) params.set('isp', truncate(h.isp, 32))
    if (h.asn) params.set('asn', h.asn)
    if (h.city) params.set('city', h.city)
    if (h.connectionType) params.set('ct', h.connectionType)
    if (h.effectiveConnectionType) params.set('ect', h.effectiveConnectionType)
    if (h.webrtcLeakDetected !== null) params.set('wrtc', h.webrtcLeakDetected ? '1' : '0')
    if (h.packetLossPercent !== null) params.set('pl', r(h.packetLossPercent))
    if (h.dnsTimeMs !== null) params.set('dns', r(h.dnsTimeMs, 0))
    if (h.cdnLatencies && h.cdnLatencies.length > 0) {
      params.set(
        'cdn',
        h.cdnLatencies
          .map((c) => `${encodeURIComponent(c.name)}:${Math.round(c.latencyMs)}`)
          .join(',')
      )
    }
  }

  return params.toString()
}

export function decode(hash: string): TestResults | null {
  try {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash
    const params = new URLSearchParams(raw)

    if (params.get('v') !== '1') return null

    const dl = parseFloat(params.get('dl') ?? '')
    const ul = parseFloat(params.get('ul') ?? '')
    const lat = parseFloat(params.get('lat') ?? '')
    const j = parseFloat(params.get('j') ?? '')
    const bb = parseFloat(params.get('bb') ?? '')
    const bbg = params.get('bbg') as BufferBloatGrade
    const nr = decodeURIComponent(params.get('nr') ?? '')
    const ts = parseInt(params.get('ts') ?? '0', 10)

    if ([dl, ul, lat, j, bb].some(isNaN)) return null
    if (!['A', 'B', 'C', 'D', 'F'].includes(bbg)) return null

    const regionStr = params.get('r') ?? ''
    const regions: RegionResult[] = regionStr
      ? regionStr.split(',').map((part) => {
          const segs = part.split(':')
          const name = decodeURIComponent(segs[0] ?? '')
          if (segs[1] === 'err')
            return { name, downloadMbps: null, uploadMbps: null, latencyMs: null, error: 'failed' }
          return {
            name,
            downloadMbps: parseFloat(segs[1] ?? '') || null,
            uploadMbps: parseFloat(segs[2] ?? '') || null,
            latencyMs: parseFloat(segs[3] ?? '') || null,
            error: null,
          }
        })
      : []

    // Health checks are optional — absent in v1 links generated before this feature.
    let healthChecks: HealthCheckResults | null = null
    if (params.has('isp') || params.has('pl') || params.has('wrtc')) {
      const cdnStr = params.get('cdn') ?? ''
      const cdnLatencies: CdnLatency[] = cdnStr
        ? cdnStr.split(',').map((seg) => {
            const [name, ms] = seg.split(':')
            return { name: decodeURIComponent(name ?? ''), latencyMs: parseFloat(ms ?? '') || 0 }
          })
        : []

      const pl = params.get('pl')
      const dns = params.get('dns')
      const wrtc = params.get('wrtc')

      healthChecks = {
        isp: params.get('isp'),
        asn: params.get('asn'),
        city: params.get('city'),
        connectionType: params.get('ct'),
        effectiveConnectionType: params.get('ect'),
        webrtcLeakDetected: wrtc !== null ? wrtc === '1' : null,
        webrtcIps: [],
        packetLossPercent: pl !== null ? parseFloat(pl) : null,
        dnsTimeMs: dns !== null ? parseFloat(dns) : null,
        cdnLatencies: cdnLatencies.length > 0 ? cdnLatencies : null,
      }
    }

    return {
      downloadMbps: dl,
      uploadMbps: ul,
      latencyMs: lat,
      jitterMs: j,
      bufferBloatDelta: bb,
      bufferBloatGrade: bbg,
      nearestRegion: nr,
      regions,
      timestamp: ts,
      healthChecks,
    }
  } catch {
    return null
  }
}
