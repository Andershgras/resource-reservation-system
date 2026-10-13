import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Unit tests run in the app's scheduling time zone, so date handling behaves
// the same on every machine, including CI runners that use UTC.
process.env.TZ = 'Europe/Copenhagen'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // CSS is replaced with an empty string in tests, except the tokens, which
    // a test reads to check that the two dark theme blocks match.
    css: { include: [/tokens\.css/] },
    restoreMocks: true,
    unstubGlobals: true,
  },
})
