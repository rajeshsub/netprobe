import type { Phase } from '../lib/testOrchestrator'
import type { RegionResult, TestResults, HealthCheckResults } from '../lib/urlSerializer'
import type { BufferBloatGrade } from '../lib/bufferBloatDetector'

export interface TimedSample {
  t: number // seconds elapsed since phase start
  ms: number
}

class TestState {
  phase = $state<Phase>('idle')
  downloadMbps = $state(0)
  uploadMbps = $state(0)
  latencyMs = $state(0)
  jitterMs = $state(0)
  bufferBloatDelta = $state(0)
  bufferBloatGrade = $state<BufferBloatGrade>('A')
  bufferBloatUploadGrade = $state<BufferBloatGrade | null>(null)
  bufferBloatUploadDelta = $state<number | null>(null)
  bufferBloatSamples = $state<number[]>([])
  downloadLatencyTimeline = $state<TimedSample[]>([])
  uploadLatencyTimeline = $state<TimedSample[]>([])
  testStartMs = $state(0)
  uploadPhaseStartMs = $state(0)
  regions = $state<RegionResult[]>([])
  nearestRegion = $state('')
  healthChecks = $state<HealthCheckResults | null>(null)
  bufferBloatReady = $state(false)
  error = $state<string | null>(null)

  reset() {
    this.phase = 'idle'
    this.downloadMbps = 0
    this.uploadMbps = 0
    this.latencyMs = 0
    this.jitterMs = 0
    this.bufferBloatDelta = 0
    this.bufferBloatGrade = 'A'
    this.bufferBloatUploadGrade = null
    this.bufferBloatUploadDelta = null
    this.bufferBloatSamples = []
    this.downloadLatencyTimeline = []
    this.uploadLatencyTimeline = []
    this.testStartMs = 0
    this.uploadPhaseStartMs = 0
    this.regions = []
    this.nearestRegion = ''
    this.healthChecks = null
    this.bufferBloatReady = false
    this.error = null
  }

  addLatencySample(ms: number) {
    this.bufferBloatSamples = [...this.bufferBloatSamples, ms]
    if (this.testStartMs === 0) return
    if (this.phase === 'nearest_upload') {
      if (this.uploadPhaseStartMs === 0) this.uploadPhaseStartMs = performance.now()
      const t = (performance.now() - this.uploadPhaseStartMs) / 1000
      this.uploadLatencyTimeline = [...this.uploadLatencyTimeline, { t, ms }]
    } else {
      const t = (performance.now() - this.testStartMs) / 1000
      this.downloadLatencyTimeline = [...this.downloadLatencyTimeline, { t, ms }]
    }
  }

  addRegion(r: RegionResult) {
    this.regions = [...this.regions, r]
  }

  loadSharedResults(r: TestResults) {
    this.downloadMbps = r.downloadMbps
    this.uploadMbps = r.uploadMbps
    this.latencyMs = r.latencyMs
    this.jitterMs = r.jitterMs
    this.bufferBloatDelta = r.bufferBloatDelta
    this.bufferBloatGrade = r.bufferBloatGrade
    this.regions = r.regions
    this.nearestRegion = r.nearestRegion
    this.healthChecks = r.healthChecks
    this.phase = 'done'
  }
}

export const testState = new TestState()
