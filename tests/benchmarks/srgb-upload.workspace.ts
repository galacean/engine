import { fileURLToPath } from "node:url";
import { defineWorkspace } from "vitest/config";

// Opt-in: HEADLESS=true pnpm exec vitest run --workspace tests/benchmarks/srgb-upload.workspace.ts --browser.headless
export default defineWorkspace([
  {
    extends: fileURLToPath(new URL("../vitest.config.ts", import.meta.url)),
    root: fileURLToPath(new URL("..", import.meta.url)),
    test: { include: ["benchmarks/srgb-upload.perf.ts"], testTimeout: 120000 }
  }
]);
