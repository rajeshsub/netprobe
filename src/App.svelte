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

  let copied = $state(false)
  let isShared = $state(false)
  let traceEpoch = $state(0)

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
          console.error(
            `[netprobe] worker file not found: ${workerBase}ndt7-download-worker.js (${r.status})`
          )
        else console.log(`[netprobe] worker files OK at ${workerBase}`)
      })
      .catch((e) => console.error('[netprobe] worker file fetch failed:', e))
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
    testState.phase = 'locating'
    traceEpoch = 0
    isShared = false

    try {
      const results = await runFullTest({
        onPhase: (p) => {
          if (p === 'nearest_download' && traceEpoch === 0) traceEpoch = Date.now()
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
        <div
          class="progress-panel"
          class:panel-done={isDone && testProducedData}
          class:panel-warn={isDone && !testProducedData}
        >
          <!-- Progress bar row -->
          <div class="progress-header">
            {#if isDone && testProducedData}
              <span class="progress-label done-label">
                <span class="done-tick" aria-hidden="true">✓</span>
                All {STEPS.length} steps complete
              </span>
            {:else if isDone && !testProducedData}
              <span class="progress-label warn-label">
                <span class="warn-icon" aria-hidden="true">!</span>
                No data returned. Check browser console (F12) for details.
                {#if testState.error}<em>{testState.error}</em>{/if}
              </span>
            {:else}
              <span class="progress-label">Step {completedStepCount} of {STEPS.length}</span>
            {/if}
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

          <!-- Step checklist -->
          <ol class="step-list">
            {#each STEPS as step (step.id)}
              {@const done = isStepDone(step.id)}
              {@const active = isStepActive(step.id)}
              <li class="step" class:step-done={done} class:step-active={active}>
                <span class="step-icon" aria-hidden="true">
                  {#if done}
                    <span class="tick">✓</span>
                  {:else if active}
                    <span class="pulse-dot"></span>
                  {:else}
                    <span class="empty-dot"></span>
                  {/if}
                </span>
                <span class="step-label">{step.label}</span>
                <span class="step-hint">
                  {#if step.id === 'server' && testState.nearestRegion}
                    {testState.nearestRegion.split('.')[0]}
                  {:else if step.id === 'download' && testState.downloadMbps > 0 && (done || active)}
                    {testState.downloadMbps.toFixed(0)} Mbps
                  {:else if step.id === 'buffer_bloat' && testState.bufferBloatReady}
                    Grade {testState.bufferBloatGrade}
                  {:else if step.id === 'upload' && testState.uploadMbps > 0 && (done || active)}
                    {testState.uploadMbps.toFixed(0)} Mbps
                  {:else if step.id === 'global' && testState.regions.length > 0}
                    {testState.regions.length} / {TOTAL_REGIONS}
                  {:else if step.id === 'health' && isDone}
                    7 checks
                  {/if}
                </span>
              </li>
            {/each}
          </ol>
        </div>
      {/if}

      <div class="metrics-grid">
        <TraceBorder active={testState.phase === 'nearest_download'} syncEpoch={traceEpoch}>
          <SpeedGauge
            value={testState.downloadMbps}
            max={500}
            label="Download"
            unit="Mbps"
            active={testState.phase === 'nearest_download'}
          />
        </TraceBorder>
        <TraceBorder active={testState.phase === 'nearest_upload'} syncEpoch={traceEpoch}>
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
          syncEpoch={traceEpoch}
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
          syncEpoch={traceEpoch}
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
          syncEpoch={traceEpoch}
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
        <TraceBorder active={testState.phase === 'global'} syncEpoch={traceEpoch}>
          <RegionTable regions={testState.regions} loading={testState.phase === 'global'} />
        </TraceBorder>
      {/if}

      {#if testState.phase === 'health' || testState.phase === 'done' || testState.healthChecks !== null}
        <TraceBorder active={testState.phase === 'health'} syncEpoch={traceEpoch}>
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
    border-radius: 10px;
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

  /* ── Progress panel ─────────────────────────────────────── */

  .progress-panel {
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: border-color 0.3s;
  }

  .progress-panel.panel-done {
    border-color: var(--grade-a);
  }

  .progress-panel.panel-warn {
    border-color: var(--grade-c);
  }

  .progress-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .progress-label {
    font-size: 0.78rem;
    color: var(--subtext);
    white-space: nowrap;
    letter-spacing: 0.01em;
    flex-shrink: 0;
    min-width: 7.5rem;
  }

  .done-label {
    color: var(--grade-a);
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .warn-label {
    color: var(--grade-c);
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .done-tick {
    font-weight: 700;
    font-size: 0.85rem;
  }

  .warn-icon {
    font-weight: 800;
    font-size: 0.85rem;
  }

  .progress-track {
    flex: 1;
    height: 4px;
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

  /* ── Step list ─────────────────────────────────────────── */

  .step-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.3rem 0;
    font-size: 0.8rem;
    color: var(--subtext);
    border-top: 1px solid transparent;
    transition: color 0.2s;
  }

  .step:first-child {
    border-top: 1px solid var(--border-subtle);
  }

  .step + .step {
    border-top: 1px solid var(--border-subtle);
  }

  .step.step-done {
    color: var(--text);
  }

  .step.step-active {
    color: var(--text);
  }

  .step-icon {
    width: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .tick {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--grade-a);
    line-height: 1;
  }

  .pulse-dot {
    display: block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    animation: pulse 1.2s ease-in-out infinite;
  }

  .empty-dot {
    display: block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    border: 1px solid var(--border-subtle);
    background: transparent;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.3;
      transform: scale(0.7);
    }
  }

  .step-label {
    flex: 1;
  }

  .step-hint {
    font-size: 0.72rem;
    color: var(--subtext);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }

  .step.step-done .step-hint {
    color: var(--accent);
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
    border-radius: 10px;
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
    border-radius: 10px;
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
    border-radius: 12px;
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
