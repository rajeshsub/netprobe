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
  })

  const phaseLabel: Record<string, string> = {
    locating:          'Finding nearest server...',
    nearest_download:  'Measuring download speed...',
    nearest_upload:    'Measuring upload speed...',
    global:            'Testing global regions...',
    done:              'Test complete',
    error:             'Something went wrong',
  }

  const isRunning = $derived(
    testState.phase !== 'idle' &&
    testState.phase !== 'done' &&
    testState.phase !== 'error'
  )

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
      <h1 class="wordmark">Echometer</h1>
      <p class="tagline">Network quality, measured honestly.</p>
    </div>
  </header>

  <main class="container">
    {#if isShared}
      <div class="shared-banner">
        Viewing shared results — <button class="link-btn" onclick={startTest}>run your own test</button>
      </div>
    {/if}

    {#if testState.phase === 'idle'}
      <div class="hero-idle">
        <p class="hero-desc">
          Measures latency, jitter, download &amp; upload speed across 6 global regions, plus buffer bloat — the hidden connection killer.
        </p>
        <button class="start-btn" onclick={startTest}>Start Test</button>
      </div>
    {:else}
      {#if isRunning}
        <div class="status-bar">
          <span class="status-dot" aria-hidden="true"></span>
          {phaseLabel[testState.phase] ?? ''}
        </div>
      {/if}

      <div class="metrics-grid">
        <SpeedGauge
          value={testState.downloadMbps}
          label="Download"
          unit="Mbps"
          icon="↓"
          active={testState.phase === 'nearest_download'}
        />
        <SpeedGauge
          value={testState.uploadMbps}
          label="Upload"
          unit="Mbps"
          icon="↑"
          active={testState.phase === 'nearest_upload'}
        />
        <SpeedGauge
          value={testState.latencyMs}
          label="Latency"
          unit="ms"
          icon="◉"
        />
        <SpeedGauge
          value={testState.jitterMs}
          label="Jitter"
          unit="ms"
          icon="~"
        />
      </div>

      {#if testState.phase === 'nearest_download' || testState.phase === 'done'}
        <BufferBloatPanel
          grade={testState.bufferBloatGrade}
          delta={testState.bufferBloatDelta}
          samples={testState.bufferBloatSamples}
          active={testState.phase === 'nearest_download'}
        />
      {/if}

      {#if testState.regions.length > 0 || testState.phase === 'global'}
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

      {#if testState.phase === 'done'}
        <div class="actions">
          <button class="start-btn small" onclick={startTest}>Run Again</button>
          <button class="copy-btn" onclick={copyLink}>
            {copied ? '✓ Copied' : 'Copy Link'}
          </button>
        </div>
      {/if}
    {/if}
  </main>

  <footer class="container">
    <p>Tests use <a href="https://www.measurementlab.net/" target="_blank" rel="noreferrer">M-Lab NDT7</a> infrastructure. Results stored nowhere.</p>
  </footer>
</div>

<style>
  .layout {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  header {
    border-bottom: 1px solid var(--border);
    padding: 1.25rem 0;
  }

  .container {
    max-width: 760px;
    margin: 0 auto;
    padding: 0 1rem;
    width: 100%;
  }

  .wordmark {
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: var(--accent);
    line-height: 1;
  }

  .tagline {
    font-size: 0.8rem;
    color: var(--subtext);
    margin-top: 0.2rem;
  }

  main {
    flex: 1;
    padding-top: 2rem;
    padding-bottom: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .shared-banner {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.625rem 1rem;
    font-size: 0.85rem;
    color: var(--subtext);
  }

  .link-btn {
    background: none;
    color: var(--accent);
    font-size: inherit;
    text-decoration: underline;
    padding: 0;
  }

  .hero-idle {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    padding: 4rem 1rem;
    text-align: center;
  }

  .hero-desc {
    font-size: 1.05rem;
    color: var(--subtext);
    max-width: 480px;
    line-height: 1.6;
  }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--subtext);
    padding: 0.25rem 0;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    animation: blink 1.1s ease-in-out infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1 }
    50% { opacity: 0.2 }
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
  }

  @media (max-width: 540px) {
    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .start-btn {
    background: var(--accent);
    color: #000;
    font-size: 1rem;
    font-weight: 700;
    padding: 0.875rem 2.5rem;
    border-radius: 8px;
    letter-spacing: 0.02em;
    transition: opacity 0.15s;
  }

  .start-btn.small {
    font-size: 0.875rem;
    padding: 0.625rem 1.5rem;
  }

  .start-btn:hover {
    opacity: 0.88;
  }

  .copy-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 0.875rem;
    padding: 0.625rem 1.5rem;
    border-radius: 8px;
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
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .error-box p {
    font-size: 0.9rem;
    color: #ef4444;
  }

  footer {
    border-top: 1px solid var(--border);
    padding: 1rem 0;
  }

  footer p {
    font-size: 0.75rem;
    color: var(--subtext);
    padding: 0 1rem;
  }

  footer a {
    color: var(--accent);
    text-decoration: none;
  }

  footer a:hover {
    text-decoration: underline;
  }
</style>
