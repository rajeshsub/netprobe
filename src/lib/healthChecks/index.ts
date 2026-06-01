import { getIspInfo } from './ispInfo'
import { getConnectionType } from './connectionType'
import { detectWebRTCLeak } from './webrtcLeak'
import { measurePacketLoss } from './packetLoss'
import { measureCDNLatency } from './cdnLatency'
import { measureDnsTime } from './dnsTime'
import type { HealthCheckResults } from '../urlSerializer'

export type { HealthCheckResults }

export async function runEarlyHealthChecks(): Promise<{
  ispInfo: Awaited<ReturnType<typeof getIspInfo>>
  webrtcLeakDetected: boolean
  webrtcIps: string[]
  connectionType: string | null
  effectiveConnectionType: string | null
}> {
  const connType = getConnectionType()
  const ispInfo = await getIspInfo()
  const webrtc = await detectWebRTCLeak(ispInfo?.ip ?? null)

  return {
    ispInfo,
    webrtcLeakDetected: webrtc.leakDetected,
    webrtcIps: webrtc.publicIps,
    connectionType: connType.type,
    effectiveConnectionType: connType.effectiveType,
  }
}

export async function runLateHealthChecks(regionHostnames: string[]): Promise<{
  packetLossPercent: number | null
  cdnLatencies: HealthCheckResults['cdnLatencies']
  dnsTimeMs: number | null
}> {
  const [packetLossPercent, cdnLatencies] = await Promise.all([
    measurePacketLoss(regionHostnames),
    measureCDNLatency(),
  ])
  const dnsTimeMs = await measureDnsTime()
  return { packetLossPercent, cdnLatencies, dnsTimeMs }
}

export function combineHealthResults(
  early: Awaited<ReturnType<typeof runEarlyHealthChecks>>,
  late: Awaited<ReturnType<typeof runLateHealthChecks>>
): HealthCheckResults {
  return {
    isp: early.ispInfo?.isp ?? null,
    asn: early.ispInfo?.asn ?? null,
    city: early.ispInfo?.city ?? null,
    connectionType: early.connectionType,
    effectiveConnectionType: early.effectiveConnectionType,
    webrtcLeakDetected: early.webrtcLeakDetected,
    webrtcIps: early.webrtcIps,
    packetLossPercent: late.packetLossPercent,
    dnsTimeMs: late.dnsTimeMs,
    cdnLatencies: late.cdnLatencies,
  }
}
