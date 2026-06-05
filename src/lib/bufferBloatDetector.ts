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
  return sorted[Math.floor(sorted.length * p)] ?? sorted[sorted.length - 1]
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

function ping(url: string): Promise<number> {
  return new Promise((resolve) => {
    const t = performance.now()
    const img = new Image()
    const done = () => resolve(performance.now() - t)
    img.onload = done
    img.onerror = done
    img.src = `${url}?t=${t}`
  })
}

// Measures buffer bloat during download, and optionally upload.
// Samples are tracked separately per phase so each direction gets its own
// grade — combining them inflates the grade because upload saturates the
// outgoing path, spiking any outgoing ping by 200ms+ even on healthy connections.
export async function measureBufferBloat(
  pingUrl: string,
  runDownload: () => Promise<void>,
  onSample: (ms: number) => void,
  runUpload?: () => Promise<void>
): Promise<BufferBloatResult> {
  const baselineSamples: number[] = []
  for (let i = 0; i < 5; i++) {
    try {
      baselineSamples.push(await ping(pingUrl))
    } catch {
      /* skip */
    }
    await new Promise<void>((r) => setTimeout(r, 100))
  }

  const downloadSamples: number[] = []
  const uploadSamples: number[] = []
  let inUpload = false
  let active = true

  const pingLoop = async () => {
    while (active) {
      try {
        const ms = await ping(pingUrl)
        if (inUpload) uploadSamples.push(ms)
        else downloadSamples.push(ms)
        onSample(ms)
      } catch {
        /* skip */
      }
      await new Promise<void>((r) => setTimeout(r, 200))
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
    uploadGrade: ul?.grade,
    uploadDelta: ul?.delta,
  }
}
