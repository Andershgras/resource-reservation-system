import { defineConfig, devices } from '@playwright/test'

// End-to-end tests against the real stack: nginx, the API, SQL Server and
// Mailpit, started with
//   docker compose -f compose.yaml -f compose.mailpit.yaml up
// No API is mocked. See docs/testing.md.
export default defineConfig({
  testDir: './e2e',
  // The journeys share one database, so they run one at a time.
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://localhost:8443',
    // The local and CI stacks use a self-signed certificate. The deploy smoke
    // test checks TLS against that certificate properly.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
