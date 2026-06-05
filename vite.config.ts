import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  base: process.env.VITE_BASE_URL || '/',
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'vmForks',
    sequence: { concurrent: false },
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 25,
        branches: 25,
        functions: 25,
        statements: 25,
      },
    },
  },
})
