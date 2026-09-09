import { defineConfig, devices } from "@playwright/test";


export default defineConfig({
  testDir: "./tests/integration",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  timeout: 180_000,
  expect: { timeout: 25_000 },
  use: {
    baseURL: process.env.INTEGRATION_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-real-backend",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.INTEGRATION_BROWSER_CHANNEL || "msedge",
      },
    },
  ],
});
