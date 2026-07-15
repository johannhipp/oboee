import { defineConfig, devices } from "@playwright/test";

const testOrigin = process.env.OBOE_TEST_ORIGIN ?? "http://localhost:3100";
const testPort = new URL(testOrigin).port || "3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: testOrigin, trace: "retain-on-failure" },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${testPort}`,
    url: testOrigin,
    reuseExistingServer: !process.env.CI || Boolean(process.env.OBOE_TEST_ORIGIN),
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: testOrigin,
      ...(process.env.OBOE_TEST_ORIGIN ? { OBOE_DEV_FIXTURE: "true" } : {}),
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
