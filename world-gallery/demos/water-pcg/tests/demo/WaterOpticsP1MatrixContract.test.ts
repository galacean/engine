import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  WATER_OPTICS_P1_CONSUMERS,
  WATER_OPTICS_P1_OCEAN_CONSUMER_ID,
  WATER_OPTICS_P1_POOL_CONSUMER_ID,
  WATER_OPTICS_P1_RIVER_CONSUMER_ID
} from "../../demo/examples/water-optics-lab/WaterOpticsP1MatrixScene";

function readWaterPcgSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

describe("Water Optics P1 cross-body matrix contract", () => {
  it("freezes two eligible horizontal surfaces and one explicitly ineligible River consumer", () => {
    expect(WATER_OPTICS_P1_CONSUMERS).toEqual(
      expect.objectContaining({
        pool: expect.objectContaining({
          id: WATER_OPTICS_P1_POOL_CONSUMER_ID,
          bodyKind: "pool-heightfield",
          planarEligible: true
        }),
        river: expect.objectContaining({
          id: WATER_OPTICS_P1_RIVER_CONSUMER_ID,
          bodyKind: "river",
          planarEligible: false
        }),
        ocean: expect.objectContaining({
          id: WATER_OPTICS_P1_OCEAN_CONSUMER_ID,
          bodyKind: "ocean",
          planarEligible: true
        }),
        secondaryPool: expect.objectContaining({
          bodyKind: "secondary-pool-heightfield",
          planarEligible: true
        })
      })
    );
    expect(new Set(Object.values(WATER_OPTICS_P1_CONSUMERS).map((consumer) => consumer.id)).size).toBe(4);
    expect(Object.values(WATER_OPTICS_P1_CONSUMERS).filter((consumer) => consumer.planarEligible)).toHaveLength(3);
    expect(WATER_OPTICS_P1_CONSUMERS.secondaryPool.planeY).not.toBe(WATER_OPTICS_P1_CONSUMERS.pool.planeY);
    for (const consumer of Object.values(WATER_OPTICS_P1_CONSUMERS)) {
      expect(consumer.screenAreaRatio).toBeGreaterThan(0);
      expect(consumer.screenAreaRatio).toBeLessThanOrEqual(1);
      expect(Number.isFinite(consumer.cameraDistanceMeters)).toBe(true);
      expect(Number.isFinite(consumer.planeY)).toBe(true);
    }
  });

  it("renders real Heightfield, River, and Ocean material consumers through one reused binding instance", () => {
    const matrix = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsP1MatrixScene.ts");
    const controller = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabController.ts");

    expect(matrix).toContain("createRiverMaterial(");
    expect(matrix).toContain("RiverGeometryCompiler.compile(");
    expect(matrix).toContain("uploadRiverMeshes(engine, artifact).surfaceMesh");
    expect(matrix).toContain("setRiverSurfaceOpticsBinding(");
    expect(matrix).toContain("createWaterWaveMaterial(");
    expect(matrix).toContain("setWaterWaveSurfaceOpticsBinding(");
    expect(matrix).toContain('"river-submerged-marker-red"');
    expect(matrix).toContain('"ocean-submerged-marker-red"');
    expect(matrix).toContain('"water-optics-p1-dual-pool-river-consumer"');
    expect(matrix).toContain('"dual-pool-river-submerged-marker-red"');
    expect(controller).toContain("this._options.waterRuntime.setSurfaceOpticsBinding(binding);");
    expect(controller).toContain("this._options.p1Matrix.applyRiverBinding(binding);");
    expect(controller).toContain("this._options.p1Matrix.applyOceanBinding(binding);");
    expect(matrix).toContain("usesSharedBindingReference(");
    expect(controller).toContain("this._lastPrimaryBinding === this._p1SharedBinding");
    expect(controller).toContain("this._lastSecondaryPoolBinding === this._p1SharedBinding");
    expect(controller).toContain("this._options.p1Matrix.usesRiverBindingReference(this._p1SharedBinding)");
    expect(controller).toContain('validationScope: "evidence-gated"');
  });

  it("exposes owner handoff and bounded lifecycle controls without a second camera-copy broker", () => {
    const controller = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabController.ts");
    const types = readWaterPcgSource("demo/examples/water-optics-lab/types.ts");

    expect(controller).toContain("setP1PlanarConsumerVisible(");
    expect(controller).toContain("runP1LifecycleStress(");
    expect(controller).toContain("eligiblePlanarRequestCount");
    expect(controller).toContain("selectedPlanarOwnerId");
    expect(controller).toContain("pendingPlanarOwnerId");
    expect(controller).toContain("renderedPlanarOwnerId");
    expect(types).toContain("readonly cameraDepthCopyPassCount: 0 | 1;");
    expect(types).toContain("readonly cameraOpaqueCopyPassCount: 0 | 1;");
    expect(types).toContain("readonly cameraFeatureConsumerIds: readonly string[];");
    expect(types).toContain("readonly consumerPlaneYs: Readonly<{");
    expect(types).toContain("readonly experimentalAdditionalRenderTargetCount: number;");
    expect(controller).toContain("this._experimentalRenderTargetCreateBaseline");
    expect(controller.match(/preferredSource: this\._reflectionSource/g)).toHaveLength(5);
    expect(controller).toContain(
      "WATER_OPTICS_P1_RIVER_CONSUMER_ID,\n                WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID"
    );
  });

  it("fail-closes renderer provenance and commits reviewed baselines transactionally", () => {
    const acceptance = readWaterPcgSource("e2e/water-optics-p1-acceptance.mjs");

    expect(acceptance).toContain('environment.webgl.unmaskedRenderer !== "extension-unavailable"');
    expect(acceptance).toContain("environment.webgl.unmaskedRenderer.includes(NATIVE_RENDERER_SUBSTRING)");
    expect(acceptance).toContain("!SOFTWARE_RENDERER_PATTERN.test(environment.webgl.unmaskedRenderer)");
    expect(acceptance).toContain("NATIVE_RENDERER_SUBSTRING.trim().length > 0");
    expect(acceptance).toContain('dataUrl: `data:image/png;base64,${bytes.toString("base64")}`');
    expect(acceptance).toContain("committedBodyMatrix.dataUrl");
    expect(acceptance).toContain("committedDualOwner.dataUrl");
    expect(acceptance).toContain("baseline update lacks refraction feature evidence");
    expect(acceptance).toContain("snapshot.waterLayerExcludedFromPlanar === true");
    expect(acceptance).toContain("(snapshot.planarCameraCullingMask & snapshot.waterLayerMask) === 0");
    expect(acceptance).not.toContain("snapshot.reflection.waterLayerExcludedFromPlanar");
    expect(acceptance).toContain("WATER_OPTICS_P1_BASELINE_UPDATE_REASON");
    expect(acceptance).toContain('resolve(OUTPUT_DIRECTORY, "baseline-review", tier, name)');
    expect(acceptance).toContain('const oldPath = resolve(reviewDirectory, "old.png")');
    expect(acceptance).toContain('const nextPath = resolve(reviewDirectory, "new.png")');
    expect(acceptance).toContain('const diffPath = resolve(reviewDirectory, "diff.png")');
    expect(acceptance).toContain('gate: "water-optics-p1-baseline-review"');
    expect(acceptance).toContain("baseline update lacks old/new/diff review artifacts");
    expect(acceptance).toContain("await rename(BASELINE_ROOT, backupRoot)");
    expect(acceptance).toContain("await rename(stagingRoot, BASELINE_ROOT)");
    expect(acceptance).toContain("Baseline commit and rollback both failed.");
    expect(acceptance).toContain("Baseline update committed, but backup cleanup failed.");
    expect(acceptance).toContain(
      "Baseline failure injection requires update mode and an explicit isolated baseline root."
    );
    expect(acceptance).toContain("BASELINE_ROOT !== DEFAULT_BASELINE_ROOT");
    expect(acceptance).toContain("await browser?.close()");
    expect(acceptance.indexOf("await browser?.close()")).toBeLessThan(acceptance.indexOf("report.status ="));
  });
});
