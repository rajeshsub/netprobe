import { config } from '../config'

export interface RegionServer {
  name: string
  hostname: string
}

export function getGlobalRegions(): RegionServer[] {
  return [...config.regions]
}

export function buildPingUrl(hostname: string): string {
  return `https://${hostname}/ndt/v7/download`
}

export async function selectServers() {
  return { nearest: null, global: getGlobalRegions() }
}
