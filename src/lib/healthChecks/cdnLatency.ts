export interface CdnLatency {
  name: string
  latencyMs: number
}

// Endpoints are small, globally-distributed, and respond to no-cors GET/HEAD.
const CDN_TARGETS = [
  {
    name: 'Cloudflare',
    urls: ['https://cloudflare.com/cdn-cgi/trace', 'https://1.1.1.1/cdn-cgi/trace'],
  },
  { name: 'Google', urls: ['https://www.google.com/generate_204', 'https://dns.google/'] },
  { name: 'AWS', urls: ['https://d1.awsstatic.com/', 'https://aws.amazon.com/'] },
  { name: 'Fastly', urls: ['https://www.fastly.com/', 'https://api.fastly.com/'] },
  { name: 'Akamai', urls: ['https://www.akamai.com/', 'https://developer.akamai.com/'] },
  {
    name: 'CloudFront',
    urls: ['https://d3c33hcgiwev3.cloudfront.net/', 'https://cloudfront.net/'],
  },
]

async function pingOnce(url: string): Promise<number> {
  const t0 = performance.now()
  await fetch(url, {
    method: 'HEAD',
    mode: 'no-cors',
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  })
  return performance.now() - t0
}

async function measureCdn(name: string, urls: string[]): Promise<CdnLatency | null> {
  for (const url of urls) {
    const samples: number[] = []
    for (let i = 0; i < 3; i++) {
      try {
        samples.push(await pingOnce(url))
      } catch {
        /* skip */
      }
      if (i < 2) await new Promise((r) => setTimeout(r, 100))
    }
    if (samples.length > 0) return { name, latencyMs: Math.min(...samples) }
  }
  return null
}

export async function measureCDNLatency(): Promise<CdnLatency[] | null> {
  const results = await Promise.all(CDN_TARGETS.map((t) => measureCdn(t.name, t.urls)))
  const successes = results.filter((r): r is CdnLatency => r !== null)
  return successes.length > 0 ? successes : null
}
