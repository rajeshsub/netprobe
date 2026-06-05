// Measures HTTP-level connection reliability (analogous to packet loss).
// True ICMP packet loss is not accessible from a browser — this measures the
// fraction of HTTP requests that fail or time out, which is a reliable proxy.

const TIMEOUT_MS = 2000
const PROBES = 5

async function probe(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return true
  } catch {
    return false
  }
}

async function lossRateForUrl(url: string): Promise<number> {
  // Stagger into two batches to catch intermittent drops, not just one-off failures.
  const r1 = await Promise.all(Array.from({ length: Math.ceil(PROBES / 2) }, () => probe(url)))
  await new Promise((r) => setTimeout(r, 150))
  const r2 = await Promise.all(Array.from({ length: Math.floor(PROBES / 2) }, () => probe(url)))
  const all = [...r1, ...r2]
  return (all.filter((ok) => !ok).length / all.length) * 100
}

// Highly-available public endpoints first — these are far more reliable than
// regional Linode servers (which may block HEAD or be temporarily unreachable).
const PRIORITY_ENDPOINTS = [
  'https://cloudflare.com/cdn-cgi/trace',
  'https://www.google.com/generate_204',
  'https://ipinfo.io/',
]

export async function measurePacketLoss(regionHostnames: string[]): Promise<number | null> {
  // Test three independent endpoints in parallel and average their loss rates.
  // Using multiple independent targets prevents a single unreachable server
  // from falsely reporting 100% loss.
  const candidates = [...PRIORITY_ENDPOINTS, ...regionHostnames.map((h) => `https://${h}/`)].slice(
    0,
    4
  )

  const results = await Promise.allSettled(candidates.map(lossRateForUrl))

  const values = results
    .filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled')
    .map((r) => r.value)

  if (values.length === 0) return null

  // Return the median loss rate across all tested endpoints.
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
