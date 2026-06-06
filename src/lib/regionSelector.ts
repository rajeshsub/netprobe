import { config } from '../config'

export interface RegionServer {
  name: string
  hostname: string
}

// Fallback servers per region from multiple cloud providers.
// Tried in parallel with the primary — if Linode rate-limits or blocks, these
// absorb the failure silently.
export const REGION_FALLBACKS: Record<string, string[]> = {
  'US East': [
    'speedtest-nyc1.digitalocean.com',
    'nj-us-ping.vultr.com',
    's3.us-east-1.amazonaws.com',
  ],
  'US West': [
    'speedtest-sfo2.digitalocean.com',
    'wa-us-ping.vultr.com',
    's3.us-west-2.amazonaws.com',
  ],
  'EU West': [
    'speedtest-lon1.digitalocean.com',
    'lon-gb-ping.vultr.com',
    's3.eu-west-1.amazonaws.com',
  ],
  'Asia East': [
    'speedtest-sgp1.digitalocean.com',
    'sgp-sg-ping.vultr.com',
    's3.ap-northeast-1.amazonaws.com',
  ],
  Oceania: [
    'speedtest-syd1.digitalocean.com',
    'syd-au-ping.vultr.com',
    's3.ap-southeast-2.amazonaws.com',
  ],
}

export function getGlobalRegions(): RegionServer[] {
  return [...config.regions]
}

export function buildPingUrl(hostname: string): string {
  return `https://${hostname}/favicon.ico`
}

export async function selectServers() {
  return { nearest: null, global: getGlobalRegions() }
}
