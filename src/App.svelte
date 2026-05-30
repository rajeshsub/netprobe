<script lang="ts">
  import { onMount } from 'svelte'
  import { testState } from './stores/testState.svelte'
  import { runFullTest } from './lib/testOrchestrator'
  import { encode, decode } from './lib/urlSerializer'
  import SpeedGauge from './components/SpeedGauge.svelte'
  import BufferBloatPanel from './components/BufferBloatPanel.svelte'
  import RegionTable from './components/RegionTable.svelte'

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
      .then(r => {
        if (!r.ok) console.error(`[netprobe] worker file not found: ${workerBase}ndt7-download-worker.js (${r.status})`)
        else console.log(`[netprobe] worker files OK at ${workerBase}`)
      })
      .catch(e => console.error('[netprobe] worker file fetch failed:', e))
  })

  const phaseLabel: Record<string, string> = {
    locating:         'Finding nearest server...',
    nearest_download: 'Measuring download speed...',
    nearest_upload:   'Measuring upload speed...',
    global:           'Testing global regions...',
    done:             'Test complete',
    error:            'Something went wrong',
  }

  const isRunning = $derived(
    testState.phase !== 'idle' &&
    testState.phase !== 'done' &&
    testState.phase !== 'error'
  )

  const isDone = $derived(testState.phase === 'done')
  const testProducedData = $derived(testState.downloadMbps > 0 || testState.uploadMbps > 0)

  async function startTest() {
    testState.reset()
    testState.phase = 'locating'
    isShared = false

    try {
      const results = await runFullTest({
        onPhase: (p) => { testState.phase = p },
        onDownloadSample: (s) => { testState.downloadMbps = s.mbps },
        onUploadSample: (s) => { testState.uploadMbps = s.mbps },
        onLatencySample: (ms) => { testState.addLatencySample(ms) },
        onRegionComplete: (r) => { testState.addRegion(r) },
        onNearestServer: (h) => { testState.nearestRegion = h },
        onError: (msg) => { testState.error = msg },
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
    setTimeout(() => { copied = false }, 2000)
  }
</script>

<div class="layout">
  <header>
    <div class="container">
      <div class="brand">
        <h1 class="wordmark">Netprobe</h1>
        <span class="tagline">Network quality, measured honestly.</span>
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
          Measures download &amp; upload speed, latency, jitter, and buffer bloat — the hidden killer of connection quality. Tests your nearest server plus 5 global regions.
        </p>
        <button class="start-btn" onclick={startTest}>Start Test</button>
      </div>
    {:else}
      {#if isRunning || isDone}
        <div class="status-panel" class:done={isDone && testProducedData} class:warn={isDone && !testProducedData}>
          {#if isDone && testProducedData}
            <span class="done-dot" aria-hidden="true">✓</span>
            <span>All steps complete</span>
          {:else if isDone && !testProducedData}
            <span class="warn-dot" aria-hidden="true">!</span>
            <span>
              No data returned. Check the browser console (F12 → Console) for the error.
              {#if testState.error} <em>{testState.error}</em>{/if}
            </span>
          {:else}
            <span class="pulse-dot" aria-hidden="true"></span>
            <span>{phaseLabel[testState.phase] ?? ''}</span>
          {/if}
        </div>
      {/if}

      <div class="metrics-grid">
        <SpeedGauge
          value={testState.downloadMbps}
          max={500}
          label="Download"
          unit="Mbps"
          active={testState.phase === 'nearest_download'}
        />
        <SpeedGauge
          value={testState.uploadMbps}
          max={250}
          label="Upload"
          unit="Mbps"
          active={testState.phase === 'nearest_upload'}
        />
        <SpeedGauge
          value={testState.latencyMs}
          max={150}
          label="Latency"
          unit="ms"
        />
        <SpeedGauge
          value={testState.jitterMs}
          max={50}
          label="Jitter"
          unit="ms"
        />
      </div>

      {#if testState.phase !== 'idle' && testState.phase !== 'locating' && testState.phase !== 'error'}
        <BufferBloatPanel
          grade={testState.bufferBloatGrade}
          delta={testState.bufferBloatDelta}
          samples={testState.bufferBloatSamples}
          active={testState.phase === 'nearest_download'}
          done={isDone}
        />
      {/if}

      {#if testState.phase === 'global' || testState.phase === 'done' || testState.regions.length > 0}
        <RegionTable
          regions={testState.regions}
          loading={testState.phase === 'global'}
        />
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
      Tests run via <a href="https://www.measurementlab.net/" target="_blank" rel="noreferrer">M-Lab NDT7</a>.
      No results stored anywhere.
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

  .status-panel {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.82rem;
    color: var(--subtext);
    background: var(--surface);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 0.7rem 1rem;
    letter-spacing: 0.01em;
  }

  .status-panel.done {
    border-color: var(--grade-a);
    color: var(--grade-a);
  }

  .status-panel.warn {
    border-color: var(--grade-c);
    color: var(--grade-c);
  }

  .done-dot {
    font-size: 0.85rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .warn-dot {
    font-size: 0.85rem;
    font-weight: 800;
    flex-shrink: 0;
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    flex-shrink: 0;
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1) }
    50% { opacity: 0.3; transform: scale(0.7) }
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.875rem;
  }

  @media (max-width: 520px) {
    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .start-btn {
    background: var(--accent);
    color: #000;
    font-size: 1rem;
    font-weight: 700;
    padding: 0.875rem 2.75rem;
    border-radius: 10px;
    letter-spacing: 0.01em;
    transition: opacity 0.15s, box-shadow 0.15s;
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
