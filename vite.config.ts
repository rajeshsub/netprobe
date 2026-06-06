import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  base: process.env.VITE_BASE_URL || '/',
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'vmForks',
    sequence: { concurrent: false },
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 58,
        branches: 60,
        functions: 45,
        statements: 58,
      },
    },
  },
})
