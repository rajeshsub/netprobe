export interface IspInfo {
  isp: string
  asn: string
  city: string
  ip: string
}

async function tryIpApiCo(): Promise<IspInfo> {
  const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) })
  const d = await res.json()
  if (!d.ip) throw new Error('no ip')
  return { isp: d.org ?? '', asn: d.asn ?? '', city: d.city ?? '', ip: d.ip }
}

async function tryIpApiCom(): Promise<IspInfo> {
  const res = await fetch('https://ip-api.com/json/?fields=status,isp,as,city,query', {
    signal: AbortSignal.timeout(4000),
  })
  const d = await res.json()
  if (d.status !== 'success') throw new Error('failed')
  return { isp: d.isp ?? '', asn: d.as ?? '', city: d.city ?? '', ip: d.query ?? '' }
}

async function tryIpInfo(): Promise<IspInfo> {
  const res = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(4000) })
  const d = await res.json()
  if (!d.ip) throw new Error('no ip')
  return { isp: d.org ?? '', asn: '', city: d.city ?? '', ip: d.ip }
}

async function tryCloudflareTrace(): Promise<IspInfo> {
  const res = await fetch('https://cloudflare.com/cdn-cgi/trace', {
    signal: AbortSignal.timeout(4000),
  })
  const text = await res.text()
  const get = (key: string) => text.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() ?? ''
  const ip = get('ip')
  if (!ip) throw new Error('no ip')
  return { isp: get('org'), asn: '', city: get('loc'), ip }
}

const PROVIDERS = [tryIpApiCo, tryIpApiCom, tryIpInfo, tryCloudflareTrace]

// Run all providers in parallel — return the first one that succeeds.
// Sequential fallback would add 4s per failure (up to 16s total), which
// holds open connections and starves other concurrent network activity.
export async function getIspInfo(): Promise<IspInfo | null> {
  try {
    return await Promise.any(PROVIDERS.map((fn) => fn()))
  } catch {
    return null
  }
}
