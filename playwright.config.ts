import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e/tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "html",
  timeout: process.env.CI ? 180000 : 120000,
  use: {
    baseURL: "http://localhost:5175",
    trace: process.env.CI ? "on-first-retry" : "on-first-retry",
    video: process.env.CI ? "off" : "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: process.env.CI ? 180000 : 30000,
    navigationTimeout: process.env.CI ? 180000 : 60000
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1200, height: 800 },
        launchOptions: {
          args: process.env.CI
            ? [
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-webgl",
                "--ignore-gpu-blocklist",
                "--disable-gpu-sandbox",
                "--disable-software-rasterizer",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-web-security",
                "--disable-features=VizDisplayCompositor"
              ]
            : ["--use-gl=egl", "--ignore-gpu-blocklist", "--use-gl=angle"]
        }
      }
    }
  ],
  webServer: {
    command: "npm run e2e:case",
    timeout: 120 * 1000,
    stdout: "pipe",
    stderr: "pipe"
  },
  outputDir: "e2e/test-results"
});
