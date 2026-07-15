import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    env: {
      OBOE_SERVER_COMMAND_SECRET:
        process.env.OBOE_SERVER_COMMAND_SECRET ??
        "oboe-e2e-server-command-secret-0001",
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
