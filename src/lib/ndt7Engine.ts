import { discoverServerURLs, downloadTest, uploadTest } from '@m-lab/ndt7'
import { config } from '../config'

export interface SpeedSample {
  elapsedSeconds: number
  mbps: number
}

export interface NDT7Result {
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
  jitterMs: number
  serverHostname: string
}

export interface NDT7Callbacks {
  onServerChosen?: (hostname: string) => void
  onDownloadStart?: () => void
  onDownloadSample?: (sample: SpeedSample) => void
  onLatencySample?: (ms: number) => void
  onDownloadComplete?: () => void
  onUploadSample?: (sample: SpeedSample) => void
  onError?: (msg: string) => void
}

function extractHostname(urls: Record<string, string>): string {
  const downloadUrl = urls['wss:///ndt/v7/download'] || ''
  try {
    return new URL(downloadUrl).hostname
  } catch {
    return ''
  }
}

function mbpsFromClientData(data: { MeanClientMbps?: number }): number {
  return data.MeanClientMbps ?? 0
}

function latencyFromServerMeasurement(m: { TCPInfo?: { MinRTT?: number; RTTVar?: number } }) {
  const rtt = m?.TCPInfo?.MinRTT ?? 0
  const rttVar = m?.TCPInfo?.RTTVar ?? 0
  return { latencyMs: rtt / 1000, jitterMs: rttVar / 1000 }
}

function rttFromServerMeasurement(m: Record<string, unknown>): number {
  const tcpInfo = m.TCPInfo as { RTT?: number; SmoothedRTT?: number } | undefined
  const rtt = tcpInfo?.RTT ?? tcpInfo?.SmoothedRTT ?? 0
  return rtt / 1000 // μs → ms
}

// Build WebSocket URL map for a known server, bypassing the locate API entirely.
// Used by ndt7DirectProvider and global region tests to avoid 429 rate-limit errors.
export function buildDirectUrlMap(hostname: string): Record<string, string> {
  return {
    '///ndt/v7/download': `wss://${hostname}/ndt/v7/download`,
    '///ndt/v7/upload': `wss://${hostname}/ndt/v7/upload`,
  }
}

export async function runTestDirect(
  hostname: string,
  callbacks: NDT7Callbacks
): Promise<NDT7Result> {
  const baseConfig = {
    userAcceptedDataPolicy: true,
    loadbalancer: config.locateApiUrl,
    metadata: {
      client_name: config.clientName,
      client_version: config.clientVersion,
    },
    downloadworkerfile: config.workerBase + 'ndt7-download-worker.js',
    uploadworkerfile: config.workerBase + 'ndt7-upload-worker.js',
  }

  const urlPromise = Promise.resolve(buildDirectUrlMap(hostname))
  let downloadMbps = 0
  let uploadMbps = 0
  let latencyMs = 0
  let jitterMs = 0

  callbacks.onServerChosen?.(hostname)

  await downloadTest(
    baseConfig,
    {
      downloadStart: () => callbacks.onDownloadStart?.(),
      downloadMeasurement: ({
        Source,
        Data,
      }: {
        Source: string
        Data: Record<string, unknown>
      }) => {
        if (Source === 'client') {
          const sample = {
            elapsedSeconds: (Data.ElapsedTime as number) ?? 0,
            mbps: mbpsFromClientData(Data as { MeanClientMbps?: number }),
          }
          downloadMbps = sample.mbps
          callbacks.onDownloadSample?.(sample)
        } else {
          const rtt = rttFromServerMeasurement(Data)
          if (rtt > 0) callbacks.onLatencySample?.(rtt)
          const { latencyMs: l, jitterMs: j } = latencyFromServerMeasurement(
            Data as { TCPInfo?: { MinRTT?: number; RTTVar?: number } }
          )
          if (l > 0) {
            latencyMs = l
            jitterMs = j
          }
        }
      },
      downloadComplete: ({
        LastServerMeasurement,
      }: {
        LastServerMeasurement?: { TCPInfo?: { MinRTT?: number; RTTVar?: number } }
      }) => {
        if (LastServerMeasurement) {
          const { latencyMs: l, jitterMs: j } = latencyFromServerMeasurement(LastServerMeasurement)
          if (l > 0) {
            latencyMs = l
            jitterMs = j
          }
        }
        callbacks.onDownloadComplete?.()
      },
      error: (msg: string) => callbacks.onError?.(msg),
    },
    urlPromise
  )

  await uploadTest(
    baseConfig,
    {
      uploadMeasurement: ({ Source, Data }: { Source: string; Data: Record<string, unknown> }) => {
        if (Source === 'client') {
          const sample = {
            elapsedSeconds: (Data.ElapsedTime as number) ?? 0,
            mbps: mbpsFromClientData(Data as { MeanClientMbps?: number }),
          }
          uploadMbps = sample.mbps
          callbacks.onUploadSample?.(sample)
        }
      },
      error: (msg: string) => callbacks.onError?.(msg),
    },
    urlPromise
  )

  return { downloadMbps, uploadMbps, latencyMs, jitterMs, serverHostname: hostname }
}

export async function runTest(
  serverHostname: string | null,
  callbacks: NDT7Callbacks
): Promise<NDT7Result> {
  const baseConfig = {
    userAcceptedDataPolicy: true,
    loadbalancer: config.locateApiUrl,
    metadata: {
      client_name: config.clientName,
      client_version: config.clientVersion,
      ...(serverHostname ? { machine: serverHostname } : {}),
    },
    downloadworkerfile: config.workerBase + 'ndt7-download-worker.js',
    uploadworkerfile: config.workerBase + 'ndt7-upload-worker.js',
  }

  let downloadMbps = 0
  let uploadMbps = 0
  let latencyMs = 0
  let jitterMs = 0
  let serverHostnameResolved = serverHostname ?? ''

  const urlPromise = discoverServerURLs(baseConfig, {
    serverChosen: (server: { urls: Record<string, string>; machine?: string }) => {
      serverHostnameResolved = server.machine ?? extractHostname(server.urls)
      callbacks.onServerChosen?.(serverHostnameResolved)
    },
    error: (msg: string) => callbacks.onError?.(msg),
  })

  await downloadTest(
    baseConfig,
    {
      downloadStart: () => callbacks.onDownloadStart?.(),
      downloadMeasurement: ({
        Source,
        Data,
      }: {
        Source: string
        Data: Record<string, unknown>
      }) => {
        if (Source === 'client') {
          const sample = {
            elapsedSeconds: (Data.ElapsedTime as number) ?? 0,
            mbps: mbpsFromClientData(Data as { MeanClientMbps?: number }),
          }
          downloadMbps = sample.mbps
          callbacks.onDownloadSample?.(sample)
        } else {
          // Emit current smoothed RTT for the live sparkline
          const rtt = rttFromServerMeasurement(Data)
          if (rtt > 0) callbacks.onLatencySample?.(rtt)

          const { latencyMs: l, jitterMs: j } = latencyFromServerMeasurement(
            Data as { TCPInfo?: { MinRTT?: number; RTTVar?: number } }
          )
          if (l > 0) {
            latencyMs = l
            jitterMs = j
          }
        }
      },
      downloadComplete: ({
        LastServerMeasurement,
      }: {
        LastServerMeasurement?: { TCPInfo?: { MinRTT?: number; RTTVar?: number } }
      }) => {
        if (LastServerMeasurement) {
          const { latencyMs: l, jitterMs: j } = latencyFromServerMeasurement(LastServerMeasurement)
          if (l > 0) {
            latencyMs = l
            jitterMs = j
          }
        }
        callbacks.onDownloadComplete?.()
      },
      error: (msg: string) => callbacks.onError?.(msg),
    },
    urlPromise
  )

  await uploadTest(
    baseConfig,
    {
      uploadMeasurement: ({ Source, Data }: { Source: string; Data: Record<string, unknown> }) => {
        if (Source === 'client') {
          const sample = {
            elapsedSeconds: (Data.ElapsedTime as number) ?? 0,
            mbps: mbpsFromClientData(Data as { MeanClientMbps?: number }),
          }
          uploadMbps = sample.mbps
          callbacks.onUploadSample?.(sample)
        }
      },
      error: (msg: string) => callbacks.onError?.(msg),
    },
    urlPromise
  )

  return { downloadMbps, uploadMbps, latencyMs, jitterMs, serverHostname: serverHostnameResolved }
}
