<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import uPlot from 'uplot'

  let { samples }: { samples: number[] } = $props()

  let container: HTMLDivElement
  let chart: uPlot | null = null
  let resizeObserver: ResizeObserver | null = null

  function makeData(s: number[]): uPlot.AlignedData {
    const xs = s.map((_, i) => i * 0.25)
    return [xs, s]
  }

  function createChart(width: number) {
    const isDark = !window.matchMedia('(prefers-color-scheme: light)').matches
    const accent = isDark ? '#00e5ff' : '#0284c7'
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'

    return new uPlot(
      {
        width,
        height: 110,
        cursor: { show: false },
        legend: { show: false },
        padding: [8, 4, 4, 4],
        axes: [
          { show: false },
          {
            show: true,
            size: 36,
            gap: 4,
            ticks: { show: false },
            grid: { stroke: gridColor, width: 1 },
            stroke: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
            font: '10px system-ui',
          },
        ],
        series: [
          {},
          {
            stroke: accent,
            width: 2,
            fill: `${accent}18`,
          },
        ],
        scales: { y: { min: 0 } },
      },
      makeData(samples),
      container
    )
  }

  onMount(() => {
    chart = createChart(container.clientWidth || 300)

    resizeObserver = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width
      if (chart && width > 0) chart.setSize({ width, height: 110 })
    })
    resizeObserver.observe(container)
  })

  $effect(() => {
    if (chart && samples.length) chart.setData(makeData(samples))
  })

  onDestroy(() => {
    resizeObserver?.disconnect()
    chart?.destroy()
  })
</script>

<div bind:this={container} class="sparkline"></div>

<style>
  .sparkline {
    width: 100%;
    overflow: hidden;
    border-radius: 8px;
  }

  .sparkline :global(.u-wrap) {
    width: 100% !important;
  }
</style>
