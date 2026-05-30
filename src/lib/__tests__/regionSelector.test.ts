import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPingUrl } from '../regionSelector'

vi.mock('../../config', () => ({
  config: {
    locateApiUrl: 'https://locate.measurementlab.net/v2/nearest/ndt/ndt7',
    clientName: 'echometer',
    clientVersion: '1.0.0',
    workerBase: '/',
    regions: [
      { name: 'US East',   hostname: 'mlab1-lga05.mlab-oti.measurement-lab.org' },
      { name: 'US West',   hostname: 'mlab1-lax05.mlab-oti.measurement-lab.org' },
      { name: 'EU West',   hostname: 'mlab1-lhr05.mlab-oti.measurement-lab.org' },
      { name: 'Asia East', hostname: 'mlab1-nrt05.mlab-oti.measurement-lab.org' },
      { name: 'Oceania',   hostname: 'mlab1-syd05.mlab-oti.measurement-lab.org' },
    ],
  },
}))

import { selectServers, getGlobalRegions } from '../regionSelector'

describe('getGlobalRegions', () => {
  it('returns exactly 5 regions', () => {
    const regions = getGlobalRegions()
    expect(regions).toHaveLength(5)
  })

  it('includes all expected region names', () => {
    const names = getGlobalRegions().map(r => r.name)
    expect(names).toContain('US East')
    expect(names).toContain('US West')
    expect(names).toContain('EU West')
    expect(names).toContain('Asia East')
    expect(names).toContain('Oceania')
  })

  it('every region has a non-empty hostname', () => {
    getGlobalRegions().forEach(r => {
      expect(r.hostname).toBeTruthy()
    })
  })
})

describe('buildPingUrl', () => {
  it('builds an HTTPS URL to the server root', () => {
    expect(buildPingUrl('mlab1-lga05.mlab-oti.measurement-lab.org'))
      .toBe('https://mlab1-lga05.mlab-oti.measurement-lab.org/')
  })

  it('handles arbitrary hostnames', () => {
    expect(buildPingUrl('example.com')).toBe('https://example.com/')
  })
})
