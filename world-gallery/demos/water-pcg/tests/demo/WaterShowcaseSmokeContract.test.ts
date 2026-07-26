import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("Water Showcase shared Smoke contract", () => {
  it("waits for the Pool Planar dataset without relaxing its exact assertions", () => {
    const source = readFileSync(fileURLToPath(new URL("../../e2e/water-showcase-smoke.mjs", import.meta.url)), "utf8");

    expect(source).toContain("const SEMANTIC_READY_TIMEOUT_MS = 10_000;");
    expect(source).toContain('"planarCameraCount"');
    expect(source).toContain('"planarRenderTargetCount"');
    expect(source).toContain('"planarFilterSampleCount"');
    expect(source.match(/await waitForShowcaseSemanticsReady\(page, definition\)/g)).toHaveLength(2);
    expect(source).toContain('numberFromDataset(poolDataset.planarCameraCount, "Pool Planar Camera count") === 1');
    expect(source).toContain('numberFromDataset(poolDataset.planarRenderTargetCount, "Pool Planar RT count") === 1');
    expect(source).toContain(
      'numberFromDataset(poolDataset.planarFilterSampleCount, "Pool Planar filter sample count") === 5'
    );
  });
});
