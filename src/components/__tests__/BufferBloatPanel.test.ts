import { describe, it, expect, vi } from 'vitest'

// uplot reads window.matchMedia at module load time; LatencySparkline uses ResizeObserver.
// Both are absent from jsdom — patch before any module imports.
vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (_query: string) => ({
      matches: false,
      media: _query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  ;(globalThis as Record<string, unknown>).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

import { render, screen } from '@testing-library/svelte'
import BufferBloatPanel from '../BufferBloatPanel.svelte'

const baseProps = {
  grade: 'A' as const,
  delta: 3,
  samples: [],
  active: false,
  done: false,
}

describe('BufferBloatPanel', () => {
  it('renders without errors', () => {
    const { container } = render(BufferBloatPanel, { props: baseProps })
    expect(container).toBeTruthy()
  })

  it('shows "Buffer Bloat" label', () => {
    render(BufferBloatPanel, { props: baseProps })
    expect(screen.getByText('Buffer Bloat')).toBeTruthy()
  })

  it('shows grade letter when done and samples present', () => {
    render(BufferBloatPanel, {
      props: { ...baseProps, grade: 'A', done: true, samples: [10, 12, 11] },
    })
    const gradeEl = document.querySelector('.grade')
    expect(gradeEl?.textContent).toBe('A')
  })

  it('shows grade F when done and samples present', () => {
    render(BufferBloatPanel, {
      props: { ...baseProps, grade: 'F', delta: 250, done: true, samples: [100, 200, 300] },
    })
    const gradeEl = document.querySelector('.grade')
    expect(gradeEl?.textContent).toBe('F')
  })

  it('shows delta value when done', () => {
    render(BufferBloatPanel, {
      props: { ...baseProps, grade: 'C', delta: 45, done: true, samples: [10, 50, 60] },
    })
    expect(screen.getByText(/\+45ms/)).toBeTruthy()
  })

  it('shows upload grade when uploadGrade prop is provided', () => {
    render(BufferBloatPanel, {
      props: {
        ...baseProps,
        grade: 'B',
        delta: 20,
        uploadGrade: 'C' as const,
        uploadDelta: 40,
        done: true,
        samples: [10, 25],
      },
    })
    // Upload delta with grade text appears in the panel
    expect(screen.getByText(/\+40ms.*C/)).toBeTruthy()
  })

  it('shows evaluating state when active and no samples', () => {
    render(BufferBloatPanel, {
      props: { ...baseProps, active: true, done: false, samples: [] },
    })
    expect(screen.getByText('Evaluating...')).toBeTruthy()
  })

  it('shows "Unable to measure" when done but no samples', () => {
    render(BufferBloatPanel, {
      props: { ...baseProps, done: true, samples: [] },
    })
    expect(screen.getByText('Unable to measure')).toBeTruthy()
  })

  it('shows placeholder when no samples and not started', () => {
    render(BufferBloatPanel, { props: baseProps })
    expect(screen.getByText(/Live latency graph/)).toBeTruthy()
  })

  it('has active class on panel when active=true', () => {
    render(BufferBloatPanel, {
      props: { ...baseProps, active: true },
    })
    const panel = document.querySelector('.panel')
    expect(panel?.classList.contains('active')).toBe(true)
  })

  it('does not have active class when active=false', () => {
    render(BufferBloatPanel, { props: baseProps })
    const panel = document.querySelector('.panel')
    expect(panel?.classList.contains('active')).toBe(false)
  })

  it('shows all grade scale chips A-F', () => {
    render(BufferBloatPanel, { props: baseProps })
    for (const grade of ['A', 'B', 'C', 'D', 'F']) {
      const chips = screen.getAllByText(grade)
      expect(chips.length).toBeGreaterThanOrEqual(1)
    }
  })
})
