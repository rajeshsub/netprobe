<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import uPlot from 'uplot'

  let { samples }: { samples: number[] } = $props()

  let container: HTMLDivElement
  let chart: uPlot | null = null
  let chartReady = $state(false)
  let resizeObserver: ResizeObserver | null = null

  function makeData(s: number[]): uPlot.AlignedData {
    const xs = s.map((_, i) => i * 0.2)
    return [xs, s]
  }

  function initChart(width: number) {
    if (chart) return
    const isDark = !window.matchMedia('(prefers-color-scheme: light)').matches
    const accent = isDark ? '#00e5ff' : '#0284c7'
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'

    chart = new uPlot(
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
        series: [{}, { stroke: accent, width: 2, fill: `${accent}18` }],
        scales: { y: { min: 0 } },
      },
      makeData(samples),
      container
    )
    chartReady = true
  }

  onMount(() => {
    resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width
      if (width <= 0) return
      if (!chart) {
        initChart(width)
      } else {
        chart.setSize({ width, height: 110 })
      }
    })
    resizeObserver.observe(container)
  })

  // chartReady is $state so this effect re-runs once the chart exists
  $effect(() => {
    if (chartReady && chart && samples.length) {
      chart.setData(makeData(samples))
    }
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
    min-height: 110px;
  }

  .sparkline :global(.u-wrap) {
    width: 100% !important;
  }
</style>
