import { describe, it, expect, vi } from 'vitest'
import { buildPingUrl } from '../regionSelector'

vi.mock('../../config', () => ({
  config: {
    locateApiUrl: 'https://locate.measurementlab.net/v2/nearest/ndt/ndt7',
    clientName: 'netprobe',
    clientVersion: '1.0.0',
    workerBase: '/',
    regions: [
      { name: 'US East', hostname: 'speedtest.newark.linode.com' },
      { name: 'US West', hostname: 'speedtest.fremont.linode.com' },
      { name: 'EU West', hostname: 'speedtest.london.linode.com' },
      { name: 'Asia East', hostname: 'speedtest.tokyo2.linode.com' },
      { name: 'Oceania', hostname: 'speedtest.sydney.linode.com' },
    ],
  },
}))

import { getGlobalRegions } from '../regionSelector'

describe('getGlobalRegions', () => {
  it('returns exactly 5 regions', () => {
    const regions = getGlobalRegions()
    expect(regions).toHaveLength(5)
  })

  it('includes all expected region names', () => {
    const names = getGlobalRegions().map((r) => r.name)
    expect(names).toContain('US East')
    expect(names).toContain('US West')
    expect(names).toContain('EU West')
    expect(names).toContain('Asia East')
    expect(names).toContain('Oceania')
  })

  it('every region has a hostname property', () => {
    getGlobalRegions().forEach((r) => {
      expect(r).toHaveProperty('hostname')
    })
  })
})

describe('buildPingUrl', () => {
  it('builds an HTTPS URL to the server favicon', () => {
    expect(buildPingUrl('speedtest.newark.linode.com')).toBe(
      'https://speedtest.newark.linode.com/favicon.ico'
    )
  })

  it('handles arbitrary hostnames', () => {
    expect(buildPingUrl('example.com')).toBe('https://example.com/favicon.ico')
  })
})
