import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../../e2e/grasslands-water-performance.mjs", import.meta.url)),
  "utf8"
);

describe("Grasslands formal performance harness", () => {
  it("freezes the strict desktop environment and blocking frame thresholds", () => {
    expect(source).toContain('const GATE = "grasslands-water-performance"');
    expect(source).toContain("width: 1340, height: 662");
    expect(source).toContain("const DEVICE_SCALE_FACTOR = 1");
    expect(source).toContain("const FIXED_SURFACE_TIME = 12.5");
    expect(source).toContain("minimumFrameCount: 300");
    expect(source).toContain("minimumSampleDurationMs: 5_000");
    expect(source).toContain("minimumAverageFps: 55");
    expect(source).toContain("maximumP95FrameMs: 20");
    expect(source).toContain('rendererLane: "native-hardware-webgl2"');
    expect(source).toContain("!SOFTWARE_RENDERER_PATTERN.test(rendererEvidence)");
  });

  it("records OFF to ON to OFF cost and requires GPU timing to drain", () => {
    expect(source).toContain('{ id: "off-before", appearanceEnabled: false }');
    expect(source).toContain('{ id: "on", appearanceEnabled: true }');
    expect(source).toContain('{ id: "off-after", appearanceEnabled: false }');
    expect(source).toContain('source: "EXT_disjoint_timer_query_webgl2"');
    expect(source).toContain('scope: "full-frame-envelope"');
    expect(source).toContain("gpu.pendingQueryCount === 0 && gpu.droppedSampleCount === 0");
    expect(source).toContain('"OFF-after resources did not recover to the OFF-before baseline."');
    expect(source).toContain('relativeCostThresholdSource: "water-optics-performance-separate-m4-matrix"');
  });

  it("blocks resource growth, duplicate normal allocation, Planar resources, and excessive water draws", () => {
    expect(source).toContain("maximumWaterDrawCalls: 8");
    expect(source).toContain("maximumDepthCopyPassCount: 1");
    expect(source).toContain("maximumColorCopyPassCount: 1");
    expect(source).toContain("expectedPlanarCameraCount: 0");
    expect(source).toContain("expectedPlanarRenderTargetCount: 0");
    expect(source).toContain('"RGBA8"');
    expect(source).toContain("const COMPLETE_MIP_FACTOR = 4 / 3");
    expect(source).toContain("externalTextureCreateCount === 1 && externalTextureDestroyCount === 0");
    expect(source).toContain("created GPU resources or uploaded static mesh buffers during stable frame sampling.");
    expect(source).toContain("snapshot.runtimeSet.perFrameMeshUpload === false");
  });

  it("requires one unchanged clean commit across the formal capture", () => {
    expect(source).toContain('runGit(["status", "--porcelain=v1", "--untracked-files=all"])');
    expect(source).toContain('assertCleanGitBoundary(report.source.start, "Performance start")');
    expect(source).toContain('assertCleanGitBoundary(report.source.end, "Performance end")');
    expect(source).toContain("report.source.end.head === report.source.start.head");
  });
});
