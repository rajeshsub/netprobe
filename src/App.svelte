<script lang="ts">
  import { onMount } from 'svelte'
  import { testState } from './stores/testState.svelte'
  import { runFullTest } from './lib/testOrchestrator'
  import { encode, decode } from './lib/urlSerializer'
  import { config } from './config'
  import SpeedGauge from './components/SpeedGauge.svelte'
  import BufferBloatPanel from './components/BufferBloatPanel.svelte'
  import RegionTable from './components/RegionTable.svelte'
  import ConnectionHealthPanel from './components/ConnectionHealthPanel.svelte'
  import TraceBorder from './components/TraceBorder.svelte'
  import LatencyTimeline from './components/LatencyTimeline.svelte'
  let copied = $state(false)
  let isShared = $state(false)

  onMount(() => {
    const hash = window.location.hash
    if (hash) {
      const results = decode(hash)
      if (results) {
        testState.loadSharedResults(results)
        isShared = true
      }
    }

    // Verify worker files are reachable — silent 404 is the most common cause of 0-data tests
    const { workerBase } = config
    fetch(`${workerBase}ndt7-download-worker.js`, { method: 'HEAD' })
      .then((r) => {
        if (!r.ok)
          console.error('[netprobe] worker-file-not-found', {
            path: `${workerBase}ndt7-download-worker.js`,
            status: r.status,
          })
        else console.log('[netprobe] worker-files-ok', { base: workerBase })
      })
      .catch((e) => console.error('[netprobe] worker-file-fetch-failed', { error: e }))
  })

  const TOTAL_REGIONS = 5

  // Step definitions — order matters for progress tracking
  const STEPS = [
    { id: 'server', label: 'Server discovery' },
    { id: 'download', label: 'Download test' },
    { id: 'buffer_bloat', label: 'Buffer bloat' },
    { id: 'upload', label: 'Upload test' },
    { id: 'global', label: 'Global regions' },
    { id: 'health', label: 'Connection health' },
  ] as const

  type StepId = (typeof STEPS)[number]['id']

  function isStepDone(id: StepId): boolean {
    const ph = testState.phase
    switch (id) {
      case 'server':
        return ['nearest_download', 'nearest_upload', 'global', 'health', 'done'].includes(ph)
      case 'download':
        return ['nearest_upload', 'global', 'health', 'done'].includes(ph)
      case 'buffer_bloat':
        return testState.bufferBloatReady
      case 'upload':
        return ['global', 'health', 'done'].includes(ph)
      case 'global':
        return ['health', 'done'].includes(ph)
      case 'health':
        return ph === 'done'
    }
  }

  function isStepActive(id: StepId): boolean {
    const ph = testState.phase
    switch (id) {
      case 'server':
        return ph === 'locating'
      case 'download':
        return ph === 'nearest_download'
      case 'buffer_bloat':
        return (ph === 'nearest_download' || ph === 'nearest_upload') && !testState.bufferBloatReady
      case 'upload':
        return ph === 'nearest_upload'
      case 'global':
        return ph === 'global'
      case 'health':
        return ph === 'health'
    }
  }

  const completedStepCount = $derived(STEPS.filter((s) => isStepDone(s.id)).length)
  const progressPct = $derived(Math.round((completedStepCount / STEPS.length) * 100))

  const isRunning = $derived(
    testState.phase !== 'idle' && testState.phase !== 'done' && testState.phase !== 'error'
  )

  const isDone = $derived(testState.phase === 'done')
  const testProducedData = $derived(testState.downloadMbps > 0 || testState.uploadMbps > 0)

  async function startTest() {
    testState.reset()
    testState.testStartMs = performance.now()
    testState.phase = 'locating'
    isShared = false

    try {
      const results = await runFullTest({
        onPhase: (p) => {
          testState.phase = p
        },
        onDownloadSample: (s) => {
          testState.downloadMbps = s.mbps
        },
        onUploadSample: (s) => {
          testState.uploadMbps = s.mbps
        },
        onLatencySample: (ms) => {
          testState.addLatencySample(ms)
        },
        onRegionComplete: (r) => {
          testState.addRegion(r)
        },
        onNearestServer: (h) => {
          testState.nearestRegion = h
        },
        onNearestComplete: (lat, jit) => {
          testState.latencyMs = lat
          testState.jitterMs = jit
        },
        onBufferBloatComplete: (r) => {
          testState.bufferBloatGrade = r.grade
          testState.bufferBloatDelta = r.delta
          testState.bufferBloatUploadGrade = r.uploadGrade ?? null
          testState.bufferBloatUploadDelta = r.uploadDelta ?? null
          testState.bufferBloatReady = true
        },
        onHealthComplete: (h) => {
          testState.healthChecks = h
        },
        onError: (msg) => {
          testState.error = msg
        },
      })

      testState.latencyMs = results.latencyMs
      testState.jitterMs = results.jitterMs
      testState.bufferBloatDelta = results.bufferBloatDelta
      testState.bufferBloatGrade = results.bufferBloatGrade
      testState.downloadMbps = results.downloadMbps

      window.location.hash = encode(results)
    } catch (e) {
      testState.phase = 'error'
      testState.error = String(e)
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href)
    copied = true
    setTimeout(() => {
      copied = false
    }, 2000)
  }
</script>

<div class="layout">
  <header>
    <div class="container">
      <div class="brand">
        <h1 class="wordmark">Netprobe</h1>
        <span class="tagline">Because "speed" doesn't explain the lag.</span>
      </div>
    </div>
  </header>

  <main class="container">
    {#if isShared}
      <div class="shared-banner">
        Viewing shared results —
        <button class="link-btn" onclick={startTest}>run your own test</button>
      </div>
    {/if}

    {#if testState.phase === 'idle'}
      <div class="hero">
        <p class="hero-desc">
          Measures download &amp; upload speed, latency, jitter, and buffer bloat — the hidden
          killer of connection quality. Tests your nearest server plus 5 global regions.
        </p>
        <button class="start-btn" onclick={startTest}>Start Test</button>
      </div>
    {:else}
      {#if isRunning || isDone}
        <!-- Horizontal phase stepper -->
        <div
          class="stepper-panel"
          class:panel-done={isDone && testProducedData}
          class:panel-warn={isDone && !testProducedData}
        >
          {#if isDone && !testProducedData}
            <p class="warn-msg">
              No data returned — check browser console (F12).
              {#if testState.error}<em>{testState.error}</em>{/if}
            </p>
          {/if}

          <div class="stepper-row" role="list">
            {#each STEPS as step, i (step.id)}
              {@const done = isStepDone(step.id)}
              {@const active = isStepActive(step.id)}
              <div class="stepper-node" class:done class:active role="listitem">
                {#if i > 0}<div
                    class="connector"
                    class:done={isStepDone(STEPS[i - 1]!.id)}
                  ></div>{/if}
                <div class="node-circle">
                  {#if done}
                    <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true">
                      <polyline
                        points="1,4 4,7 9,1"
                        fill="none"
                        stroke="white"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  {:else if active}
                    <span class="pulse-inner" aria-hidden="true"></span>
                  {/if}
                </div>
                <span class="node-label">{step.label}</span>
                <span class="node-hint">
                  {#if step.id === 'server' && testState.nearestRegion}
                    {testState.nearestRegion.split('.')[0]}
                  {:else if step.id === 'download' && testState.downloadMbps > 0 && (done || active)}
                    {testState.downloadMbps.toFixed(0)} Mbps
                  {:else if step.id === 'buffer_bloat' && testState.bufferBloatReady}
                    Grade {testState.bufferBloatGrade}
                  {:else if step.id === 'upload' && testState.uploadMbps > 0 && (done || active)}
                    {testState.uploadMbps.toFixed(0)} Mbps
                  {:else if step.id === 'global' && testState.regions.length > 0}
                    {testState.regions.length}/{TOTAL_REGIONS}
                  {:else if step.id === 'health' && isDone}
                    7 checks
                  {/if}
                </span>
              </div>
            {/each}
          </div>

          <!-- Progress bar -->
          <div
            class="progress-track"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div class="progress-fill" style="width: {progressPct}%"></div>
          </div>
        </div>

        <!-- Per-phase latency charts — side by side when both are visible -->
        {#if testState.downloadLatencyTimeline.length > 0 || testState.phase === 'nearest_download' || testState.uploadLatencyTimeline.length > 0 || testState.phase === 'nearest_upload'}
          <div class="timelines-row">
            {#if testState.downloadLatencyTimeline.length > 0 || testState.phase === 'nearest_download'}
              <LatencyTimeline
                samples={testState.downloadLatencyTimeline}
                title="Download — latency under load"
              />
            {/if}
            {#if testState.uploadLatencyTimeline.length > 0 || testState.phase === 'nearest_upload'}
              <LatencyTimeline
                samples={testState.uploadLatencyTimeline}
                title="Upload — latency under load"
              />
            {/if}
          </div>
        {/if}
      {/if}

      <div class="metrics-grid">
        <TraceBorder active={testState.phase === 'nearest_download'} done={isStepDone('download')}>
          <SpeedGauge
            value={testState.downloadMbps}
            max={500}
            label="Download"
            unit="Mbps"
            active={testState.phase === 'nearest_download'}
          />
        </TraceBorder>
        <TraceBorder active={testState.phase === 'nearest_upload'} done={isStepDone('upload')}>
          <SpeedGauge
            value={testState.uploadMbps}
            max={250}
            label="Upload"
            unit="Mbps"
            active={testState.phase === 'nearest_upload'}
          />
        </TraceBorder>
        <TraceBorder
          active={testState.phase === 'nearest_download' ||
            testState.phase === 'nearest_upload' ||
            (testState.latencyMs === 0 && isRunning)}
          done={isStepDone('upload')}
        >
          <SpeedGauge
            value={testState.latencyMs}
            max={150}
            label="Latency"
            unit="ms"
            active={testState.phase === 'nearest_download' ||
              testState.phase === 'nearest_upload' ||
              (testState.latencyMs === 0 && isRunning)}
          />
        </TraceBorder>
        <TraceBorder
          active={testState.phase === 'nearest_download' ||
            testState.phase === 'nearest_upload' ||
            (testState.jitterMs === 0 && isRunning)}
          done={isStepDone('upload')}
        >
          <SpeedGauge
            value={testState.jitterMs}
            max={50}
            label="Jitter"
            unit="ms"
            active={testState.phase === 'nearest_download' ||
              testState.phase === 'nearest_upload' ||
              (testState.jitterMs === 0 && isRunning)}
          />
        </TraceBorder>
        <TraceBorder
          active={testState.phase === 'nearest_download' || testState.phase === 'nearest_upload'}
          done={isStepDone('buffer_bloat')}
        >
          <BufferBloatPanel
            grade={testState.bufferBloatGrade}
            delta={testState.bufferBloatDelta}
            uploadGrade={testState.bufferBloatUploadGrade}
            uploadDelta={testState.bufferBloatUploadDelta}
            samples={testState.bufferBloatSamples}
            active={testState.phase === 'nearest_download' || testState.phase === 'nearest_upload'}
            done={testState.bufferBloatReady}
          />
        </TraceBorder>
      </div>

      {#if testState.phase === 'global' || testState.phase === 'health' || testState.phase === 'done' || testState.regions.length > 0}
        <TraceBorder active={testState.phase === 'global'} done={isStepDone('global')}>
          <RegionTable regions={testState.regions} loading={testState.phase === 'global'} />
        </TraceBorder>
      {/if}

      {#if testState.phase === 'health' || testState.phase === 'done' || testState.healthChecks !== null}
        <TraceBorder active={testState.phase === 'health'} done={isStepDone('health')}>
          <ConnectionHealthPanel
            health={testState.healthChecks}
            loading={testState.phase === 'health'}
          />
        </TraceBorder>
      {/if}

      {#if testState.phase === 'error'}
        <div class="error-box">
          <p>{testState.error ?? 'An error occurred.'}</p>
          <button class="start-btn small" onclick={startTest}>Try Again</button>
        </div>
      {/if}

      {#if isDone}
        <div class="actions">
          <button class="start-btn small" onclick={startTest}>Run Again</button>
          <button class="copy-btn" onclick={copyLink}>
            {copied ? '✓ Copied' : 'Share Results'}
          </button>
        </div>
      {/if}
    {/if}
  </main>

  <footer class="container">
    <p>
      Tests run via <a href="https://www.measurementlab.net/" target="_blank" rel="noreferrer"
        >M-Lab NDT7</a
      >,
      <a href="https://speed.cloudflare.com" target="_blank" rel="noreferrer">Cloudflare</a>, and
      fallback providers. No results stored anywhere.
    </p>
  </footer>
</div>

<style>
  .layout {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  header {
    border-bottom: 1px solid var(--border-subtle);
    padding: 1.25rem 0;
  }

  .container {
    max-width: 780px;
    margin: 0 auto;
    padding: 0 1.25rem;
    width: 100%;
  }

  .brand {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  .wordmark {
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: -0.05em;
    color: var(--accent);
    line-height: 1;
  }

  .tagline {
    font-size: 0.78rem;
    color: var(--subtext);
    letter-spacing: 0.01em;
  }

  main {
    flex: 1;
    padding-bottom: 3rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .shared-banner {
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 0;
    padding: 0.6rem 1rem;
    font-size: 0.83rem;
    color: var(--subtext);
  }

  .link-btn {
    background: none;
    color: var(--accent);
    font-size: inherit;
    text-decoration: underline;
    padding: 0;
  }

  .hero {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2.5rem;
    padding: 2rem 1rem;
    text-align: center;
    min-height: 60vh;
  }

  .hero-desc {
    font-size: 1rem;
    color: var(--subtext);
    max-width: 460px;
    line-height: 1.65;
  }

  /* ── Horizontal phase stepper ───────────────────────────── */

  .stepper-panel {
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 0;
    padding: 0.875rem 1rem 0.625rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: border-color 0.3s;
  }

  .stepper-panel.panel-done {
    border-color: var(--grade-a);
  }

  .stepper-panel.panel-warn {
    border-color: var(--grade-c);
  }

  .warn-msg {
    font-size: 0.78rem;
    color: var(--grade-c);
  }

  .stepper-row {
    display: flex;
    align-items: flex-start;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .stepper-row::-webkit-scrollbar {
    display: none;
  }

  /* Each step node occupies equal horizontal space */
  .stepper-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    min-width: 56px;
    position: relative;
    gap: 0.3rem;
  }

  /* Connector line: spans from center of previous node to center of this node */
  .stepper-node:not(:first-child) .connector {
    position: absolute;
    top: 8px; /* half of 18px circle */
    left: calc(-50% + 1px);
    width: 100%;
    height: 2px;
    background: var(--border-subtle);
    z-index: 0;
    transition: background 0.3s;
  }

  .stepper-node:not(:first-child) .connector.done {
    background: var(--grade-a);
  }

  /* Step circle */
  .node-circle {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--border-subtle);
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 1;
    flex-shrink: 0;
    transition:
      border-color 0.25s,
      background 0.25s;
  }

  .stepper-node.done .node-circle {
    border-color: var(--grade-a);
    background: var(--grade-a);
  }

  .stepper-node.active .node-circle {
    border-color: var(--accent);
  }

  /* Pulsing dot for active step */
  .pulse-inner {
    display: block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    animation: node-pulse 1.2s ease-in-out infinite;
  }

  @keyframes node-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.3;
      transform: scale(0.55);
    }
  }

  .node-label {
    font-size: 0.66rem;
    color: var(--subtext);
    text-align: center;
    white-space: nowrap;
    transition: color 0.2s;
    letter-spacing: 0.01em;
  }

  .stepper-node.done .node-label,
  .stepper-node.active .node-label {
    color: var(--text);
  }

  .node-hint {
    font-size: 0.6rem;
    color: var(--accent);
    text-align: center;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    min-height: 0.75rem;
  }

  /* Progress bar */
  .progress-track {
    height: 3px;
    background: var(--border-subtle);
    border-radius: 99px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 99px;
    transition: width 0.4s ease;
    box-shadow: 0 0 6px var(--accent-glow);
  }

  /* ── Latency timeline row ────────────────────────────────── */

  .timelines-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.875rem;
  }

  /* ── Metrics grid ────────────────────────────────────────── */

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.875rem;
    align-items: stretch;
  }

  @media (max-width: 640px) {
    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    /* Buffer bloat (TraceBorder wrapper) spans full width below the 2-col gauge pairs */
    .metrics-grid > :global(:last-child) {
      grid-column: 1 / -1;
    }
  }

  /* ── Buttons ─────────────────────────────────────────────── */

  .start-btn {
    background: var(--accent);
    color: #000;
    font-size: 1rem;
    font-weight: 700;
    padding: 0.875rem 2.75rem;
    border-radius: 0;
    letter-spacing: 0.01em;
    transition:
      opacity 0.15s,
      box-shadow 0.15s;
    box-shadow: 0 0 20px var(--accent-glow);
  }

  .start-btn:hover {
    opacity: 0.9;
    box-shadow: 0 0 32px var(--accent-glow);
  }

  .start-btn.small {
    font-size: 0.875rem;
    padding: 0.625rem 1.5rem;
  }

  .copy-btn {
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    color: var(--text);
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0.625rem 1.5rem;
    border-radius: 0;
    transition: border-color 0.15s;
  }

  .copy-btn:hover {
    border-color: var(--accent);
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .error-box {
    background: var(--surface);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 0;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .error-box p {
    font-size: 0.875rem;
    color: #ef4444;
  }

  footer {
    border-top: 1px solid var(--border-subtle);
    padding: 1rem 0;
  }

  footer p {
    font-size: 0.72rem;
    color: var(--subtext);
    padding: 0 1.25rem;
  }

  footer a {
    color: var(--accent);
    text-decoration: none;
  }

  footer a:hover {
    text-decoration: underline;
  }
</style>
