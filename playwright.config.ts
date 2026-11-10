import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  workers: 2,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, locale: 'en-US',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    baseURL: process.env.APP_URL || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: process.env.APP_URL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
})
