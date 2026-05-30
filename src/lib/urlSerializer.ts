import type { BufferBloatGrade } from './bufferBloatDetector'

export interface RegionResult {
  name: string
  downloadMbps: number | null
  uploadMbps: number | null
  latencyMs: number | null
  error: string | null
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
}

function r(n: number | null, decimals = 1): string {
  return n === null ? '' : n.toFixed(decimals)
}

export function encode(results: TestResults): string {
  const regionStr = results.regions.map(reg => {
    if (reg.error) return `${encodeURIComponent(reg.name)}:err`
    return `${encodeURIComponent(reg.name)}:${r(reg.downloadMbps)}:${r(reg.uploadMbps)}:${r(reg.latencyMs)}`
  }).join(',')

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
    const regions: RegionResult[] = regionStr ? regionStr.split(',').map(part => {
      const segs = part.split(':')
      const name = decodeURIComponent(segs[0])
      if (segs[1] === 'err') return { name, downloadMbps: null, uploadMbps: null, latencyMs: null, error: 'failed' }
      return {
        name,
        downloadMbps: parseFloat(segs[1]) || null,
        uploadMbps: parseFloat(segs[2]) || null,
        latencyMs: parseFloat(segs[3]) || null,
        error: null,
      }
    }) : []

    return { downloadMbps: dl, uploadMbps: ul, latencyMs: lat, jitterMs: j, bufferBloatDelta: bb, bufferBloatGrade: bbg, nearestRegion: nr, regions, timestamp: ts }
  } catch {
    return null
  }
}
