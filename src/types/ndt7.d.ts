declare module '@m-lab/ndt7' {
  interface NDT7Config {
    server?: string
    protocol?: string
    metadata?: Record<string, string>
    loadbalancer?: string
    clientRegistrationToken?: string
    userAcceptedDataPolicy?: boolean
    mlabDataPolicyInapplicable?: boolean
    downloadworkerfile?: string
    uploadworkerfile?: string
  }

  interface ServerChoice {
    machine?: string
    location?: { city: string; country: string }
    urls: Record<string, string>
  }

  interface Measurement {
    Source: string
    Data: Record<string, unknown>
  }

  interface CompletedTest {
    LastClientMeasurement?: Record<string, unknown>
    LastServerMeasurement?: Record<string, unknown>
  }

  interface NDT7Callbacks {
    error?: (msg: string) => void
    serverDiscovery?: (data: { loadbalancer: URL }) => void
    serverChosen?: (server: ServerChoice) => void
    downloadStart?: (data: unknown) => void
    downloadMeasurement?: (m: Measurement) => void
    downloadComplete?: (result: CompletedTest) => void
    uploadStart?: (data: unknown) => void
    uploadMeasurement?: (m: Measurement) => void
    uploadComplete?: (result: CompletedTest) => void
  }

  type URLMap = Record<string, string>

  function discoverServerURLs(config: NDT7Config, callbacks: NDT7Callbacks): Promise<URLMap>
  function downloadTest(
    config: NDT7Config,
    callbacks: NDT7Callbacks,
    urlPromise: Promise<URLMap>
  ): Promise<number>
  function uploadTest(
    config: NDT7Config,
    callbacks: NDT7Callbacks,
    urlPromise: Promise<URLMap>
  ): Promise<number>
  function test(config: NDT7Config, callbacks: NDT7Callbacks): Promise<number>
}
