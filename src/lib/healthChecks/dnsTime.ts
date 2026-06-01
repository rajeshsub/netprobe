// Reads DNS lookup time from the browser's Performance Resource Timing API.
// Only works when servers send Timing-Allow-Origin: * — returns null otherwise.
// We do NOT make extra fetches here; we read timing from requests already made
// by other health checks (ISP info, CDN latency, etc.) that ran before this.

function nonZeroDnsTimes(): number[] {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return []
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  return entries
    .filter(e => e.domainLookupStart > 0 && e.domainLookupEnd > e.domainLookupStart)
    .map(e => e.domainLookupEnd - e.domainLookupStart)
}

export async function measureDnsTime(): Promise<number | null> {
  // First pass: use timing from fetches already in the performance timeline.
  const existing = nonZeroDnsTimes()
  if (existing.length > 0) return Math.min(...existing)

  // Second pass: make a dedicated fetch to Cloudflare (which sets Timing-Allow-Origin).
  try {
    await fetch(`https://cloudflare.com/cdn-cgi/trace?_cache=${Date.now()}`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    const fresh = nonZeroDnsTimes()
    if (fresh.length > 0) return Math.min(...fresh)
  } catch { /* fall through */ }

  return null
}
