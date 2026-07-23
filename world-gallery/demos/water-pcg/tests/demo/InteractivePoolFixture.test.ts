import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { createPoolSceneLayout } from "../../demo/decoration/PoolSceneController";
import { indoorReflectivePoolExample } from "../../demo/examples/pool/indoorReflectivePool";
import { findWaterPcgCase, resolveWaterPcgCase } from "../../demo/navigation";
import { POOL_WATER_OPTICAL_PROFILE } from "../../demo/pool/PoolWaterOptics";
import { computeInteractivePoolRippleVisibility } from "../../demo/pool/InteractivePoolRippleStyle";
import { RectangularWaterHeightField } from "../../runtime/interaction/RectangularWaterHeightField";

function readDemoSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

describe("interactive indoor pool fixture", () => {
  it("routes the legacy pool anchor to the consolidated pool showcase runtime", () => {
    expect(findWaterPcgCase("indoor-reflective-pool")).toBeUndefined();
    expect(resolveWaterPcgCase({ hash: "#indoor-reflective-pool", search: "" })).toMatchObject({
      id: "showcase-pool",
      label: "泳池",
      group: "showcase",
      runtime: "pool",
      preset: "hero-pool"
    });
    const routerSource = readDemoSource("demo/router.ts");
    expect(routerSource).toContain('pool: () => import("./pool/main")');
  });

  it("derives the planned Low and Medium grids from the existing pool descriptor", () => {
    const compiled = RiverNetworkCompiler.compile(indoorReflectivePoolExample.riverDescriptor).data!;
    const layout = createPoolSceneLayout(compiled)!;
    const first = compiled.reaches[0].artifact.samples[0];
    const last = compiled.reaches[0].artifact.samples.at(-1)!;
    const axisX = last.position[0] - first.position[0];
    const axisZ = last.position[2] - first.position[2];
    const axisLength = Math.hypot(axisX, axisZ);
    for (const [resolutionX, resolutionZ, expectedSamples] of [
      [65, 27, 1755],
      [129, 53, 6837]
    ] as const) {
      const field = new RectangularWaterHeightField({
        centerX: layout.position[0],
        centerZ: layout.position[2],
        lengthAxisX: axisX / axisLength,
        lengthAxisZ: axisZ / axisLength,
        length: layout.length,
        width: layout.width,
        resolutionX,
        resolutionZ,
        waveSpeed: 4,
        damping: 0.55,
        maxDisplacement: 0.25
      });
      expect(field.sampleCount).toBe(expectedSamples);
      expect(field.computeCfl(1 / 60)).toBeLessThanOrEqual(0.9);
    }
  });

  it("keeps PhysX imports in the two dedicated runtimes and uses only public engine physics APIs", () => {
    const poolSource = readDemoSource("demo/pool/main.ts");
    const buoyancySource = readDemoSource("demo/buoyancy/main.ts");
    const riverSource = readDemoSource("demo/main.ts");
    const heightfieldSource = readDemoSource("demo/heightfield/main.ts");
    const poolFiles = [
      poolSource,
      readDemoSource("demo/pool/PoolBallSpawner.ts"),
      readDemoSource("demo/pool/PoolPhysicsSceneController.ts"),
      readDemoSource("demo/pool/InteractivePoolSurfaceController.ts"),
      readDemoSource("runtime/interaction/RectangularWaterHeightField.ts"),
      readDemoSource("runtime/buoyancy/WaterBuoyancy.ts")
    ].join("\n");

    expect(poolSource).toContain("new PhysXPhysics()");
    expect(buoyancySource).toContain("new PhysXPhysics()");
    expect(riverSource).not.toContain("PhysXPhysics");
    expect(heightfieldSource).not.toContain("PhysXPhysics");
    expect(poolSource).toContain("indoorReflectivePoolExample.riverDescriptor");
    expect(poolSource).not.toContain("waterPcgExamples");
    expect(poolFiles).not.toContain("_nativeCollider");
    expect(poolFiles).not.toContain("requestAnimationFrame");
    expect(poolFiles).not.toContain("setInterval");
    expect(poolFiles).not.toMatch(/collider\.linearVelocity\s*=/);
    expect(poolFiles).not.toMatch(/collider\.angularVelocity\s*=/);
    expect(poolFiles).toContain("applyForceAtPosition");
    expect(poolFiles).toContain("StaticCollider");
    expect(poolFiles).toContain("DynamicCollider");
  });

  it("renders a height-field-driven ripple accent without adding another mesh upload", () => {
    const surfaceSource = readDemoSource("demo/pool/InteractivePoolSurfaceController.ts");
    const rippleMaterialSource = readDemoSource("demo/pool/InteractivePoolRippleMaterial.ts");

    expect(surfaceSource).toContain("this._fieldSample.verticalVelocity");
    expect(surfaceSource).toContain("mesh.setColors(this._rippleColors)");
    expect(surfaceSource.match(/mesh\.uploadData\(false\)/g)).toHaveLength(2);
    expect(surfaceSource.match(/mesh\.addSubMesh\(/g)).toHaveLength(2);
    expect(surfaceSource).toContain("renderer.setMaterial(1, rippleMaterial)");
    expect(rippleMaterialSource).toContain("COLOR_0");
    expect(rippleMaterialSource).toContain("RenderQueueType = Transparent");
    expect(rippleMaterialSource).toContain("DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha");
    expect(rippleMaterialSource).toContain("smoothstep(0.04, 0.55, visibility)");
    expect(surfaceSource).toContain("RENDER_SUBDIVISIONS_PER_FIELD_CELL = 2");
    expect(surfaceSource).toContain("field.sampleLocal(localX, localZ, this._fieldSample)");
    expect(surfaceSource).toContain("setRiverSurfaceOpacityScale(material, POOL_WATER_OPACITY_SCALE)");
    expect(surfaceSource).toContain("setRiverSurfaceTintWeight(material, POOL_WATER_TINT_WEIGHT)");
  });

  it("shares one immutable optical profile between the real River surface and underwater pass", () => {
    const mainSource = readDemoSource("demo/pool/main.ts");
    const surfaceSource = readDemoSource("demo/pool/InteractivePoolSurfaceController.ts");

    expect(Object.isFrozen(POOL_WATER_OPTICAL_PROFILE)).toBe(true);
    expect(POOL_WATER_OPTICAL_PROFILE).toMatchObject({
      absorptionCoefficient: [0.2, 0.075, 0.035],
      scatteringColor: [0.045, 0.28, 0.34],
      scatteringCoefficient: 0.18,
      maximumViewDistance: 32,
      indexOfRefraction: 1.333,
      maximumSurfaceOpticalDistance: 2.6,
      refractionStrength: 1,
      roughness: 0.12,
      reflectionIntensity: 0.72
    });
    expect(mainSource).toContain("underwaterPass.setOpticalProfile(POOL_WATER_OPTICAL_PROFILE)");
    expect(mainSource).toContain("fallbackOpticalProfile: POOL_WATER_OPTICAL_PROFILE");
    expect(mainSource).toContain("surfaceController.setSurfaceOpticsBinding({");
    expect(mainSource).toContain("opticalProfile: POOL_WATER_OPTICAL_PROFILE");
    expect(mainSource).toContain("refractionEnabled: true");
    expect(surfaceSource).toContain("setSurfaceOpticsBinding(");
    expect(surfaceSource).toContain("setRiverSurfaceOpticsBinding(material, binding, { planarEligible: true })");
    expect(surfaceSource).toContain("setRiverSurfaceOpticsBinding(material, this._surfaceOpticsBinding, {");
  });

  it("suppresses the settled pressure trough while preserving moving crests", () => {
    const settledTrough = computeInteractivePoolRippleVisibility(-0.14, 0.02, 0);
    const settledRim = computeInteractivePoolRippleVisibility(0.005, 0.03, 0);
    const movingTrough = computeInteractivePoolRippleVisibility(-0.02, 0.02, -0.4);
    const movingCrest = computeInteractivePoolRippleVisibility(0.025, 0.02, 0.25);

    expect(settledTrough).toBeLessThan(0.08);
    expect(settledRim).toBeLessThan(0.08);
    expect(movingTrough).toBeGreaterThan(settledTrough);
    expect(movingCrest).toBeGreaterThan(movingTrough);
    expect(movingCrest).toBeGreaterThan(0.5);
  });

  it("keeps a real pressure depression and compensating rim in the shared physics height field", () => {
    const fieldSource = readDemoSource("runtime/interaction/RectangularWaterHeightField.ts");
    const buoyancySource = readDemoSource("runtime/buoyancy/WaterBuoyancy.ts");
    const providerSource = readDemoSource("runtime/interaction/InteractivePoolSurfaceProvider.ts");

    expect(fieldSource).toContain("CONTACT_STIFFNESS");
    expect(fieldSource).toContain("rimTargetScale");
    expect(fieldSource).toContain("currentContactDepression");
    expect(fieldSource).toContain("currentContactRimHeight");
    expect(buoyancySource).toContain("interactionSink.registerInteraction(");
    expect(providerSource).toContain("outSample.surfacePosition.y += fieldSample.height");
  });
});
