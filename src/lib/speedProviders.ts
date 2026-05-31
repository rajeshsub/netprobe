import { config } from '../config'
import type { SpeedSample } from './ndt7Engine'

export interface ProviderResult {
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
  jitterMs: number
  serverHostname: string
}

export interface ProviderCallbacks {
  onServerChosen?: (hostname: string) => void
  onDownloadSample?: (sample: SpeedSample) => void
  onDownloadComplete?: () => void
  onUploadSample?: (sample: SpeedSample) => void
  onLatencySample?: (ms: number) => void
}

export type ProviderFn = (callbacks: ProviderCallbacks) => Promise<ProviderResult>

async function measurePing(url: string, timeoutMs = 3000): Promise<number> {
  const start = performance.now()
  await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  return performance.now() - start
}

async function pickFastest(hostnames: string[]): Promise<string> {
  const results = await Promise.allSettled(
    hostnames.map(async (hostname) => {
      const latency = await measurePing(`https://${hostname}/favicon.ico`, 3000)
      return { hostname, latency }
    })
  )
  const ok = results
    .filter((r): r is PromiseFulfilledResult<{ hostname: string; latency: number }> => r.status === 'fulfilled')
    .sort((a, b) => a.value.latency - b.value.latency)
  if (ok.length === 0) throw new Error('No servers reachable')
  return ok[0].value.hostname
}

async function streamDownload(
  url: string,
  timeoutMs: number,
  onSample: (sample: SpeedSample) => void
): Promise<number> {
  const resp = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)
  const reader = resp.body.getReader()
  let bytes = 0
  let lastMbps = 0
  const start = performance.now()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value?.length ?? 0
    const elapsed = (performance.now() - start) / 1000
    if (elapsed > 0.2 && bytes > 0) {
      lastMbps = (bytes * 8) / (elapsed * 1_000_000)
      onSample({ elapsedSeconds: elapsed, mbps: lastMbps })
    }
  }
  if (lastMbps === 0) throw new Error('No data received')
  return lastMbps
}

async function timedUpload(url: string, bytes: number, timeoutMs: number): Promise<number> {
  const data = new Uint8Array(bytes)
  const start = performance.now()
  const resp = await fetch(url, {
    method: 'POST',
    body: data,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const elapsed = (performance.now() - start) / 1000
  return (bytes * 8) / (elapsed * 1_000_000)
}

async function multiPing(
  url: string,
  count: number,
  onSample?: (ms: number) => void
): Promise<{ latencyMs: number; jitterMs: number }> {
  const latencies: number[] = []
  for (let i = 0; i < count; i++) {
    try {
      const t = await measurePing(url, 3000)
      latencies.push(t)
      onSample?.(t)
    } catch { /* skip */ }
    if (i < count - 1) await new Promise(r => setTimeout(r, 100))
  }
  if (latencies.length === 0) throw new Error('Unreachable')
  const sorted = [...latencies].sort((a, b) => a - b)
  const latencyMs = sorted[Math.floor(sorted.length / 2)]
  const jitterMs = sorted.length > 1 ? (sorted[sorted.length - 1] - sorted[0]) / 2 : 0
  return { latencyMs, jitterMs }
}

// Provider 1: M-Lab NDT7 via locate API (primary — uses @m-lab/ndt7 + Web Workers)
export async function ndt7LocateProvider(callbacks: ProviderCallbacks): Promise<ProviderResult> {
  const { runTest } = await import('./ndt7Engine')
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn() } }
    runTest(null, {
      onServerChosen: callbacks.onServerChosen,
      onDownloadSample: callbacks.onDownloadSample,
      onDownloadComplete: callbacks.onDownloadComplete,
      onUploadSample: callbacks.onUploadSample,
      onLatencySample: callbacks.onLatencySample,
      onError: (msg) => settle(() => reject(new Error(`NDT7 locate: ${msg}`))),
    })
      .then(result => {
        if (result.downloadMbps === 0 && result.uploadMbps === 0) {
          settle(() => reject(new Error('NDT7 locate: no data returned')))
        } else {
          settle(() => resolve(result))
        }
      })
      .catch(e => settle(() => reject(e)))
  })
}

// Provider 2: M-Lab NDT7 direct (bypasses locate API — fixes 429 rate-limit errors)
export async function ndt7DirectProvider(callbacks: ProviderCallbacks): Promise<ProviderResult> {
  const { runTestDirect } = await import('./ndt7Engine')
  const hostnames = config.regions.map(r => r.hostname).filter(Boolean)
  const hostname = await pickFastest(hostnames)
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (fn: () => void) => { if (!settled) { settled = true; fn() } }
    runTestDirect(hostname, {
      onServerChosen: callbacks.onServerChosen,
      onDownloadSample: callbacks.onDownloadSample,
      onDownloadComplete: callbacks.onDownloadComplete,
      onUploadSample: callbacks.onUploadSample,
      onLatencySample: callbacks.onLatencySample,
      onError: (msg) => settle(() => reject(new Error(`NDT7 direct: ${msg}`))),
    })
      .then(result => {
        if (result.downloadMbps === 0 && result.uploadMbps === 0) {
          settle(() => reject(new Error('NDT7 direct: no data returned')))
        } else {
          settle(() => resolve(result))
        }
      })
      .catch(e => settle(() => reject(e)))
  })
}

// Provider 3: Cloudflare Speed Test (speed.cloudflare.com — independent infrastructure)
export async function cloudflareProvider(callbacks: ProviderCallbacks): Promise<ProviderResult> {
  const HOSTNAME = 'speed.cloudflare.com'
  const BASE = `https://${HOSTNAME}`
  callbacks.onServerChosen?.(HOSTNAME)

  const { latencyMs, jitterMs } = await multiPing(`${BASE}/__ping`, 5, callbacks.onLatencySample)

  const downloadMbps = await streamDownload(
    `${BASE}/__down?bytes=${25 * 1024 * 1024}`,
    30_000,
    s => callbacks.onDownloadSample?.(s)
  )
  callbacks.onDownloadComplete?.()

  const uploadMbps = await timedUpload(`${BASE}/__up`, 10 * 1024 * 1024, 30_000)
  callbacks.onUploadSample?.({ elapsedSeconds: 0, mbps: uploadMbps })

  return { downloadMbps, uploadMbps, latencyMs, jitterMs, serverHostname: HOSTNAME }
}

// Provider 4: LibreSpeed public instance (open-protocol alternative, best-effort CORS)
export async function librespeedProvider(callbacks: ProviderCallbacks): Promise<ProviderResult> {
  const HOSTNAME = 'librespeed.org'
  const BASE = `https://${HOSTNAME}`
  callbacks.onServerChosen?.(HOSTNAME)

  const { latencyMs, jitterMs } = await multiPing(
    `${BASE}/backend/empty.php?x=${Date.now()}`,
    5,
    callbacks.onLatencySample
  )

  const downloadMbps = await streamDownload(
    `${BASE}/backend/garbage.php?ckSize=25&x=${Date.now()}`,
    30_000,
    s => callbacks.onDownloadSample?.(s)
  )
  callbacks.onDownloadComplete?.()

  const uploadMbps = await timedUpload(`${BASE}/backend/empty.php`, 10 * 1024 * 1024, 30_000)
  callbacks.onUploadSample?.({ elapsedSeconds: 0, mbps: uploadMbps })

  return { downloadMbps, uploadMbps, latencyMs, jitterMs, serverHostname: HOSTNAME }
}

// Provider 5: HTTP timing fallback (smaller test sizes for degraded conditions)
export async function httpTimingProvider(callbacks: ProviderCallbacks): Promise<ProviderResult> {
  const HOSTNAME = 'speed.cloudflare.com'
  const BASE = `https://${HOSTNAME}`
  callbacks.onServerChosen?.(HOSTNAME)

  let latencyMs = 0
  let jitterMs = 0
  try {
    const r = await multiPing(`${BASE}/__ping`, 3, callbacks.onLatencySample)
    latencyMs = r.latencyMs
    jitterMs = r.jitterMs
  } catch { /* best effort */ }

  const downloadMbps = await streamDownload(
    `${BASE}/__down?bytes=${10 * 1024 * 1024}`,
    20_000,
    s => callbacks.onDownloadSample?.(s)
  )
  callbacks.onDownloadComplete?.()

  const uploadMbps = await timedUpload(`${BASE}/__up`, 5 * 1024 * 1024, 20_000)
  callbacks.onUploadSample?.({ elapsedSeconds: 0, mbps: uploadMbps })

  return { downloadMbps, uploadMbps, latencyMs, jitterMs, serverHostname: HOSTNAME }
}

export const PROVIDER_NAMES = [
  'M-Lab NDT7',
  'M-Lab Direct',
  'Cloudflare',
  'LibreSpeed',
  'HTTP Fallback',
]

export const DEFAULT_PROVIDERS: ProviderFn[] = [
  ndt7LocateProvider,
  ndt7DirectProvider,
  cloudflareProvider,
  librespeedProvider,
  httpTimingProvider,
]

export async function runWithFallback(
  providers: ProviderFn[],
  callbacks: ProviderCallbacks,
  onProviderSwitch?: (name: string, attempt: number) => void
): Promise<ProviderResult> {
  let lastError: Error | null = null
  for (let i = 0; i < providers.length; i++) {
    const name = PROVIDER_NAMES[i] ?? `Provider ${i + 1}`
    if (i > 0) {
      console.warn(`[netprobe] "${PROVIDER_NAMES[i - 1]}" failed, trying "${name}"`)
      onProviderSwitch?.(name, i + 1)
    }
    try {
      return await providers[i](callbacks)
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      console.warn(`[netprobe] ${name} failed:`, lastError.message)
    }
  }
  throw lastError ?? new Error('All speed test providers failed')
}
