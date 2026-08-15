import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Production builds are CPU-heavy on the supported CI runner; one browser
  // worker keeps upload retry timers and date-driven booking tests deterministic.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    baseURL: 'https://127.0.0.1:3100',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node scripts/start-e2e-server.mjs',
    url: 'https://127.0.0.1:3100',
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: 'https://127.0.0.1:3100',
      BACKEND_INTERNAL_URL: 'https://127.0.0.1:3102',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
