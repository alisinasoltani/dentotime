import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

// Opt-in real-backend checks against the dedicated local scenario demo.
export default defineConfig({
  testDir: "./tests/demo",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: "line",
  outputDir: path.join(tmpdir(), "dentotime-demo-playwright"),
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [{ name: "edge-demo", use: { ...devices["Desktop Edge"], channel: "msedge" } }],
});
