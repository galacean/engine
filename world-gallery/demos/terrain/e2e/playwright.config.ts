import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const galleryRoot = path.resolve(__dirname, "../../..");
const configuredUrl = process.env.TERRAIN_E2E_URL;
const baseUrl = new URL(configuredUrl ?? "http://127.0.0.1:5175");
const port = baseUrl.port || (baseUrl.protocol === "https:" ? "443" : "80");
const captureScreenshots = process.env.TERRAIN_E2E_CAPTURE === "1";

export default defineConfig({
  testDir: ".",
  testMatch: "terrain.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: process.env.TERRAIN_E2E_OUTPUT ?? path.join(os.tmpdir(), "galacean-terrain-e2e"),
  preserveOutput: "always",
  use: {
    baseURL: baseUrl.origin,
    viewport: { width: 1024, height: 576 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: configuredUrl
    ? undefined
    : {
        command: `pnpm exec vite serve . --config vite.config.js --host ${baseUrl.hostname} --port ${port}`,
        cwd: galleryRoot,
        url: baseUrl.origin,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
});
