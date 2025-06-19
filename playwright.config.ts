import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 120000,
  use: {
    baseURL: "http://localhost:5175",
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1200, height: 800 },
        launchOptions: {
          args: ["--force-device-scale-factor=1"]
        }
      }
    }
  ],
  webServer: {
    command: "npm run e2e:case",
    url: "http://localhost:5175",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000
  },
  outputDir: "e2e/test-results"
});
