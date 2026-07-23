import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { getWaterBodyCapabilities } from "../../runtime/body/WaterBodyCapabilities";
import { WaterBodyRuntimeAdapter } from "../../runtime/body/WaterBodyRuntime";
import { SurfaceDepthWaterVolumeProvider } from "../../runtime/body/SurfaceDepthWaterVolumeProvider";
import { WaterWorld, createWaterWorldVolumeSample } from "../../runtime/body/WaterWorld";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../../runtime/optics/WaterOpticalProfile";
import {
  createWaterSurfaceSample,
  resetWaterSurfaceSample,
  type WaterSurfaceProvider
} from "../../runtime/query/WaterSurfaceProvider";

function createFlatProvider(id: string, height: number): WaterSurfaceProvider {
  return {
    sampleSurface(position, out): boolean {
      resetWaterSurfaceSample(out);
      out.waterBodyId = id;
      out.surfacePosition.set(position.x, height, position.z);
      out.waterDepth = 3;
      return true;
    }
  };
}

function createBody(id: string, height: number, priority: number) {
  return new WaterBodyRuntimeAdapter({
    id,
    type: "river",
    capabilities: getWaterBodyCapabilities("river"),
    surface: createFlatProvider(id, height),
    bounds: { minX: -10, minZ: -10, maxX: 10, maxZ: 10 },
    priority,
    metrics: { meshUploadCount: 0, drawCount: 1, triangleCount: 2, resourceBytes: 0 }
  });
}

function createVolumeBody(id: string, height: number, depth: number, priority: number) {
  const surface = createFlatProvider(id, height);
  return new WaterBodyRuntimeAdapter({
    ...createBody(id, height, priority),
    surface,
    volume: new SurfaceDepthWaterVolumeProvider({
      sampleSurface(position, out): boolean {
        surface.sampleSurface(position, out);
        out.waterDepth = depth;
        return true;
      }
    }),
    opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE
  });
}

describe("WaterWorld", () => {
  it("uses priority then highest visible surface independent of registration order", () => {
    const firstWorld = new WaterWorld({ now: () => 0 });
    const secondWorld = new WaterWorld({ now: () => 0 });
    const low = createBody("low", 4, 0);
    const high = createBody("high", 6, 0);
    const priority = createBody("priority", 2, 10);
    firstWorld.register(low);
    firstWorld.register(high);
    firstWorld.register(priority);
    secondWorld.register(priority);
    secondWorld.register(high);
    secondWorld.register(low);
    const first = createWaterSurfaceSample();
    const second = createWaterSurfaceSample();

    expect(firstWorld.sampleSurface(new Vector3(), first)).toBe(true);
    expect(secondWorld.sampleSurface(new Vector3(), second)).toBe(true);
    expect(first.waterBodyId).toBe("priority");
    expect(second.waterBodyId).toBe("priority");
    expect(firstWorld.bodyMetrics).toContainEqual({
      id: "priority",
      type: "river",
      enabled: true,
      priority: 10,
      meshUploadCount: 0,
      drawCount: 1,
      triangleCount: 2,
      resourceBytes: 0
    });

    priority.enabled = false;
    expect(firstWorld.sampleSurface(new Vector3(), first)).toBe(true);
    expect(first.waterBodyId).toBe("high");
    expect(first.surfacePosition.y).toBe(6);
  });

  it("honors exclusions, unregisters destroyed bodies, and reports candidate limits", () => {
    const world = new WaterWorld({ maxCandidates: 1, now: () => 0 });
    const excluded = new WaterBodyRuntimeAdapter({
      ...createBody("excluded", 10, 20),
      exclusionBounds: [{ minX: -1, minZ: -1, maxX: 1, maxZ: 1 }]
    });
    world.register(excluded);
    world.register(createBody("first", 2, 0));
    world.register(createBody("second", 3, 0));
    const sample = createWaterSurfaceSample();

    expect(world.sampleSurface(new Vector3(), sample)).toBe(true);
    expect(sample.waterBodyId).toBe("first");
    expect(world.metrics.candidateLimitExceededCount).toBe(1);
    expect(world.unregister("first")).toBe(true);
    expect(world.sampleSurface(new Vector3(), sample)).toBe(true);
    expect(sample.waterBodyId).toBe("second");
    world.destroy();
    expect(world.metrics.registeredBodyCount).toBe(0);
    expect(world.sampleSurface(new Vector3(), sample)).toBe(false);
  });

  it("returns the registry body id even when an adapted provider has a legacy id", () => {
    const world = new WaterWorld({ now: () => 0 });
    world.register(
      new WaterBodyRuntimeAdapter({
        ...createBody("legacy", 1, 0),
        id: "registry-id",
        surface: createFlatProvider("legacy-provider-id", 1)
      })
    );
    const sample = createWaterSurfaceSample();

    expect(world.sampleSurface(new Vector3(), sample)).toBe(true);
    expect(sample.waterBodyId).toBe("registry-id");
    expect(world.lastSelectedBodyId).toBe("registry-id");
  });

  it("selects only vertically containing volumes before applying priority", () => {
    const world = new WaterWorld({ now: () => 0 });
    world.register(createVolumeBody("shallow-high-priority", 5, 1, 20));
    world.register(createVolumeBody("deep-low-priority", 4, 6, 0));
    const sample = createWaterWorldVolumeSample();

    expect(world.findContainingVolume(new Vector3(0, 2, 0), sample)).toBe(true);
    expect(sample.waterBodyId).toBe("deep-low-priority");
    expect(sample.bottomHeight).toBe(-2);
    expect(sample.opticalProfile).toBe(DEFAULT_WATER_OPTICAL_PROFILE);

    expect(world.findContainingVolume(new Vector3(0, 4.5, 0), sample)).toBe(true);
    expect(sample.waterBodyId).toBe("shallow-high-priority");
    expect(sample.priority).toBe(20);
    expect(world.metrics.volumeQueryCount).toBe(2);
    expect(world.metrics.volumeHitCount).toBe(2);
  });

  it("supports retained-body hysteresis samples while honoring exclusion and lifecycle", () => {
    const world = new WaterWorld({ now: () => 0 });
    const body = new WaterBodyRuntimeAdapter({
      ...createVolumeBody("finite", 2, 3, 10),
      exclusionBounds: [{ minX: 1, minZ: 1, maxX: 2, maxZ: 2 }]
    });
    world.register(body);
    const sample = createWaterWorldVolumeSample();

    expect(world.findContainingVolume(new Vector3(1.5, 1, 1.5), sample)).toBe(false);
    expect(world.sampleBodyVolume("finite", new Vector3(0, 2.05, 0), sample)).toBe(true);
    expect(sample.insideVolume).toBe(false);
    expect(sample.signedSurfaceDistance).toBeCloseTo(0.05);
    expect(world.unregister("finite")).toBe(true);
    expect(world.sampleBodyVolume("finite", new Vector3(0, 1, 0), sample)).toBe(false);
  });
});
