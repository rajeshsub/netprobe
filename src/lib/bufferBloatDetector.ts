export type BufferBloatGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface BufferBloatResult {
  baseline: number
  underLoad: number
  delta: number
  grade: BufferBloatGrade
  samples: number[]
}

export function gradeFromDelta(delta: number): BufferBloatGrade {
  if (delta <= 5) return 'A'
  if (delta <= 30) return 'B'
  if (delta <= 60) return 'C'
  if (delta <= 200) return 'D'
  return 'F'
}

export function computeBufferBloat(
  baselineSamples: number[],
  loadSamples: number[]
): BufferBloatResult {
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  const baseline = avg(baselineSamples)
  const underLoad = avg(loadSamples)
  const delta = Math.max(0, underLoad - baseline)
  return { baseline, underLoad, delta, grade: gradeFromDelta(delta), samples: loadSamples }
}

async function ping(url: string): Promise<number> {
  const t = performance.now()
  await fetch(url, { cache: 'no-store', mode: 'no-cors' })
  return performance.now() - t
}

export async function measureBufferBloat(
  pingUrl: string,
  runDownload: () => Promise<void>,
  onSample: (ms: number) => void
): Promise<BufferBloatResult> {
  const baselineSamples: number[] = []
  for (let i = 0; i < 5; i++) {
    try { baselineSamples.push(await ping(pingUrl)) } catch { /* skip failed pings */ }
    await new Promise<void>(r => setTimeout(r, 100))
  }

  const loadSamples: number[] = []
  let active = true

  const pingLoop = async () => {
    while (active) {
      try {
        const ms = await ping(pingUrl)
        loadSamples.push(ms)
        onSample(ms)
      } catch { /* skip */ }
      await new Promise<void>(r => setTimeout(r, 250))
    }
  }

  void pingLoop()
  await runDownload()
  active = false

  return computeBufferBloat(
    baselineSamples.length ? baselineSamples : [0],
    loadSamples.length ? loadSamples : [0]
  )
}
