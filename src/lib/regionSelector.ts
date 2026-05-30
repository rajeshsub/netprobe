import { config } from '../config'

export interface RegionServer {
  name: string
  hostname: string
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
