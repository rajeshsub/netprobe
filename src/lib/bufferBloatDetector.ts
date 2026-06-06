export type BufferBloatGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface BufferBloatResult {
  baseline: number
  underLoad: number
  delta: number
  grade: BufferBloatGrade
  samples: number[]
  // Upload phase results — only present when buffer bloat is measured during upload too.
  uploadGrade?: BufferBloatGrade
  uploadDelta?: number
}

export function gradeFromDelta(delta: number): BufferBloatGrade {
  if (delta <= 5) return 'A'
  if (delta <= 30) return 'B'
  if (delta <= 60) return 'C'
  if (delta <= 200) return 'D'
  return 'F'
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  // Both fallbacks are safe: arr is non-empty (callers guard with .length check).
  return sorted[Math.floor(sorted.length * p)] ?? sorted.at(-1)!
}

export function computeBufferBloat(
  baselineSamples: number[],
  loadSamples: number[]
): Omit<BufferBloatResult, 'uploadGrade' | 'uploadDelta'> {
  if (!baselineSamples.length || !loadSamples.length) {
    return { baseline: 0, underLoad: 0, delta: 0, grade: 'A', samples: loadSamples }
  }
  const baseline = percentile(baselineSamples, 0.5)
  const underLoad = percentile(loadSamples, 0.9)
  const delta = Math.max(0, underLoad - baseline)
  return { baseline, underLoad, delta, grade: gradeFromDelta(delta), samples: loadSamples }
}

// Image-based RTT probe. Uses <img> loading so the browser sends a real HTTP
// request cross-origin without CORS or CORP restrictions blocking the timing.
// The server's response is text/plain (not an image) so onerror fires immediately
// after the response is received — giving us accurate round-trip time.
function ping(url: string, timeoutMs = 2000): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const t0 = performance.now()
    let settled = false
    const settle = (result: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => settle(null), timeoutMs)
    img.onload = () => settle(performance.now() - t0)
    img.onerror = () => settle(performance.now() - t0)
    img.src = `${url}?_=${t0}`
  })
}

// Measures pre-load RTT baseline. One warm-up ping absorbs DNS + TLS setup so
// subsequent samples reflect steady-state RTT on an idle link.
export async function measureBaselineRTT(url: string, count: number): Promise<number[]> {
  await ping(url, 2000) // warm-up: discards connection-setup overhead
  const samples: number[] = []
  for (let i = 0; i < count; i++) {
    const ms = await ping(url, 2000)
    if (ms !== null) samples.push(ms)
    if (i < count - 1) await new Promise<void>((r) => setTimeout(r, 200))
  }
  return samples
}

// Measures buffer bloat during download and optionally upload.
//
// baselineSamples MUST be measured before any load starts — the original implementation
// measured baseline concurrently with the download, so both samples reflected the same
// loaded condition and the delta collapsed to ~0ms (false Grade A).
//
// pingUrl should be an external endpoint unrelated to the speed-test server. Pinging the
// same server risks server-side packet scheduling masking ISP last-mile queue delay.
export async function measureBufferBloat(
  pingUrl: string,
  baselineSamples: number[],
  runDownload: () => Promise<void>,
  onSample: (ms: number) => void,
  runUpload?: () => Promise<void>
): Promise<BufferBloatResult> {
  const downloadSamples: number[] = []
  const uploadSamples: number[] = []
  let inUpload = false
  let active = true

  const pingLoop = async () => {
    while (active) {
      const ms = await ping(pingUrl)
      if (ms !== null) {
        if (inUpload) uploadSamples.push(ms)
        else downloadSamples.push(ms)
        onSample(ms)
      }
      await new Promise<void>((r) => setTimeout(r, 150))
    }
  }

  void pingLoop()
  await runDownload()

  if (runUpload) {
    inUpload = true
    await runUpload()
  }

  active = false

  const dl = computeBufferBloat(baselineSamples, downloadSamples)
  const ul = runUpload ? computeBufferBloat(baselineSamples, uploadSamples) : undefined

  return {
    ...dl,
    samples: [...downloadSamples, ...uploadSamples],
    ...(ul !== undefined ? { uploadGrade: ul.grade, uploadDelta: ul.delta } : {}),
  }
}
