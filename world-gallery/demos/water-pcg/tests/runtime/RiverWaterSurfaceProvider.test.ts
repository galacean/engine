import type { Engine, Entity } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import type { RiverAuthoringConfig } from "../../authoring/river/RiverAuthoringTypes";
import { cloneCompiledRiverConfig, RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { RIVER_GEOMETRY_Y_OFFSET } from "../../compiler/river/constants";
import type { RiverCompiledData } from "../../compiler/river/types";
import { measureRiverRenderParity } from "../../demo/buoyancy/RiverRenderParity";
import { indoorReflectivePoolExample } from "../../demo/examples/pool/indoorReflectivePool";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { createWaterSurfaceSample } from "../../runtime/query/WaterSurfaceProvider";
import { createRiverNetworkQueryResult, RiverNetworkQueryService } from "../../runtime/river/RiverQueryService";
import { RiverRuntimeController } from "../../runtime/river/RiverRuntimeController";
import { RiverWaterSurfaceProvider } from "../../runtime/river/RiverWaterSurfaceProvider";
import type { RiverNetworkQueryResult } from "../../runtime/river/types";

class MutableRiverSurfaceSource {
  hit = true;
  insideFootprint = true;
  waterBodyId = "river-a";
  surfaceHeight = 3;

  sampleActiveSurface(_worldPosition: Vector3, outResult: RiverNetworkQueryResult): boolean {
    outResult.hit = this.hit;
    outResult.insideFootprint = this.insideFootprint;
    outResult.waterBodyId = this.waterBodyId;
    outResult.surfaceHeight = this.surfaceHeight;
    outResult.surfaceVerticalVelocity = 0.4;
    outResult.waterDepth = 2.5;
    outResult.flowVector.set(1.5, 0, -0.75);
    outResult.surfaceNormal.set(0.1, 0.98, 0.15).normalize();
    return this.hit;
  }
}

function createController(elapsedTime: number): RiverRuntimeController {
  const engine = { time: { elapsedTime } } as unknown as Engine;
  return new RiverRuntimeController(engine, {} as Entity);
}

function setActiveQueryService(controller: RiverRuntimeController, queryService: RiverNetworkQueryService): void {
  const state = controller as unknown as { _activeQueryService?: RiverNetworkQueryService };
  state._activeQueryService = queryService;
}

describe("RiverWaterSurfaceProvider", () => {
  it("maps a footprint hit into caller-owned world-space storage without replacing vectors", () => {
    const source = new MutableRiverSurfaceSource();
    const provider = new RiverWaterSurfaceProvider(source);
    const sample = createWaterSurfaceSample();
    const surfacePosition = sample.surfacePosition;
    const surfaceNormal = sample.surfaceNormal;
    const waterVelocity = sample.waterVelocity;

    expect(provider.sampleSurface(new Vector3(7, 12, -4), sample)).toBe(true);
    expect(sample.waterBodyId).toBe("river-a");
    expect(sample.surfacePosition).toBe(surfacePosition);
    expect(sample.surfacePosition).toMatchObject({ x: 7, y: 3, z: -4 });
    expect(sample.surfaceNormal).toBe(surfaceNormal);
    expect(sample.surfaceNormal.length()).toBeCloseTo(1);
    expect(sample.waterVelocity).toBe(waterVelocity);
    expect(sample.waterVelocity).toMatchObject({ x: 1.5, y: 0.4, z: -0.75 });
    expect(sample.waterDepth).toBe(2.5);

    source.surfaceHeight = 4;
    expect(provider.sampleSurface(new Vector3(8, 10, -5), sample)).toBe(true);
    expect(sample.surfacePosition).toBe(surfacePosition);
    expect(sample.surfaceNormal).toBe(surfaceNormal);
    expect(sample.waterVelocity).toBe(waterVelocity);
    expect(sample.surfacePosition).toMatchObject({ x: 8, y: 4, z: -5 });
  });

  it("rejects River candidate hits outside the actual footprint and clears stale output", () => {
    const source = new MutableRiverSurfaceSource();
    const provider = new RiverWaterSurfaceProvider(source);
    const sample = createWaterSurfaceSample();

    expect(provider.sampleSurface(new Vector3(), sample)).toBe(true);
    source.insideFootprint = false;
    expect(provider.sampleSurface(new Vector3(20, 5, 20), sample)).toBe(false);
    expect(sample.waterBodyId).toBe("");
    expect(sample.surfacePosition).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(sample.surfaceNormal).toMatchObject({ x: 0, y: 1, z: 0 });
    expect(sample.waterVelocity).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(sample.waterDepth).toBe(0);
  });

  it("reads the controller's active service on every query after a runtime swap", () => {
    const firstData = RiverNetworkCompiler.compile(curvedMainRiverExample.riverDescriptor).data!;
    const replacementData = RiverNetworkCompiler.compile({
      ...curvedMainRiverExample.riverDescriptor,
      id: "replacement-river"
    }).data!;
    const firstService = new RiverNetworkQueryService(firstData);
    const replacementService = new RiverNetworkQueryService(replacementData);
    const controller = createController(2.5);
    const provider = new RiverWaterSurfaceProvider(controller);
    const sample = createWaterSurfaceSample();
    const point = firstData.reaches[0].artifact.samples[8].position;
    const worldPosition = new Vector3(point[0], point[1], point[2]);

    setActiveQueryService(controller, firstService);
    expect(provider.sampleSurface(worldPosition, sample)).toBe(true);
    expect(sample.waterBodyId).toBe(firstData.sourceId);

    setActiveQueryService(controller, replacementService);
    expect(provider.sampleSurface(worldPosition, sample)).toBe(true);
    expect(sample.waterBodyId).toBe(replacementData.sourceId);
  });
});

describe("RiverRuntimeController active surface query", () => {
  it("shares live/override time with dynamic rendering and normalizes the static surface offset", () => {
    const data = RiverNetworkCompiler.compile(curvedMainRiverExample.riverDescriptor).data!;
    const service = new RiverNetworkQueryService(data);
    const controller = createController(3.25);
    const point = data.reaches[0].artifact.samples[Math.floor(data.reaches[0].artifact.samples.length * 0.42)].position;
    const worldPosition = new Vector3(point[0], point[1], point[2]);
    const actual = createRiverNetworkQueryResult();
    const expected = createRiverNetworkQueryResult();
    setActiveQueryService(controller, service);

    expect(controller.sampleActiveSurface(worldPosition, actual)).toBe(true);
    service.sampleSurfaceAtTime(worldPosition, 3.25, expected);
    expect(actual.surfaceHeight).toBeCloseTo(expected.surfaceHeight, 6);
    expect(actual.surfaceVerticalVelocity).toBeCloseTo(expected.surfaceVerticalVelocity, 6);
    expect(actual.surfaceNormal).toMatchObject(expected.surfaceNormal);

    controller.setSurfaceTimeOverride(1.75);
    expect(controller.sampleActiveSurface(worldPosition, actual)).toBe(true);
    service.sampleSurfaceAtTime(worldPosition, 1.75, expected);
    expect(actual.surfaceHeight).toBeCloseTo(expected.surfaceHeight, 6);
    expect(actual.surfaceVerticalVelocity).toBeCloseTo(expected.surfaceVerticalVelocity, 6);

    controller.setSurfaceFeatureFlags(false, true);
    expect(controller.sampleActiveSurface(worldPosition, actual)).toBe(true);
    service.sampleSurface(worldPosition, expected);
    const visibleStaticHeight = expected.surfaceHeight + RIVER_GEOMETRY_Y_OFFSET.surface;
    expect(actual.surfaceHeight).toBeCloseTo(visibleStaticHeight, 6);
    expect(actual.surfaceVerticalVelocity).toBe(0);
    expect(actual.signedSurfaceDistance).toBeCloseTo(worldPosition.y - visibleStaticHeight, 6);
    expect(actual.insideVolume).toBe(true);
    expect(actual.submergedDepth).toBeCloseTo(RIVER_GEOMETRY_Y_OFFSET.surface, 6);
  });

  it("returns false when no River runtime is active", () => {
    const controller = createController(1);
    expect(controller.sampleActiveSurface(new Vector3(), createRiverNetworkQueryResult())).toBe(false);
  });

  it("uses the rendered static surface for low-quality materials even when macro displacement is enabled", () => {
    const data = RiverNetworkCompiler.compile(curvedMainRiverExample.riverDescriptor).data!;
    const service = new RiverNetworkQueryService(data);
    const controller = createController(2.25);
    const reaches = data.reaches.map((reach) => {
      const config = cloneCompiledRiverConfig(reach.config);
      config.quality.material.level = RiverQualityLevel.Low;
      return { config };
    });
    const state = controller as unknown as {
      _activeId?: string;
      _runtimeSets: Map<
        string,
        {
          resource: { data: RiverCompiledData };
          reaches: { config: RiverAuthoringConfig }[];
        }
      >;
    };
    state._activeId = "low-runtime";
    state._runtimeSets.set("low-runtime", { resource: { data }, reaches });
    setActiveQueryService(controller, service);
    const point = data.reaches[0].artifact.samples[10].position;
    const worldPosition = new Vector3(point[0], point[1], point[2]);
    const actual = createRiverNetworkQueryResult();
    const expected = createRiverNetworkQueryResult();

    expect(controller.sampleActiveSurface(worldPosition, actual)).toBe(true);
    service.sampleSurface(worldPosition, expected);
    expect(actual.surfaceHeight).toBeCloseTo(expected.surfaceHeight + RIVER_GEOMETRY_Y_OFFSET.surface, 6);
    expect(actual.surfaceVerticalVelocity).toBe(0);
  });

  it("keeps static junction queries within the P0 five-centimeter render-parity budget", () => {
    const data = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const service = new RiverNetworkQueryService(data);
    const controller = createController(2.25);
    const reaches = data.reaches.map((reach) => {
      const config = cloneCompiledRiverConfig(reach.config);
      config.quality.material.level = RiverQualityLevel.Low;
      return { config };
    });
    const state = controller as unknown as {
      _activeId?: string;
      _macroDisplacementEnabled: boolean;
      _runtimeSets: Map<
        string,
        {
          resource: { data: RiverCompiledData };
          reaches: { config: RiverAuthoringConfig }[];
        }
      >;
    };
    state._activeId = "static-junction-runtime";
    state._macroDisplacementEnabled = false;
    state._runtimeSets.set("static-junction-runtime", { resource: { data }, reaches });
    setActiveQueryService(controller, service);

    const geometry = data.junctions[0].surfaceGeometry;
    const first = geometry.positions[geometry.indices.at(0)!];
    const second = geometry.positions[geometry.indices.at(1)!];
    const third = geometry.positions[geometry.indices.at(2)!];
    const visibleCentroid = new Vector3(
      (first[0] + second[0] + third[0]) / 3,
      (first[1] + second[1] + third[1]) / 3,
      (first[2] + second[2] + third[2]) / 3
    );
    const actual = createRiverNetworkQueryResult();

    expect(controller.sampleActiveSurface(visibleCentroid, actual)).toBe(true);
    expect(actual.insideFootprint).toBe(true);
    expect(Math.abs(actual.surfaceHeight - visibleCentroid.y)).toBeLessThanOrEqual(0.05);
  });

  it.each([
    [curvedMainRiverExample.id, curvedMainRiverExample.riverDescriptor],
    [multiTributaryRiverExample.id, multiTributaryRiverExample.riverDescriptor],
    [indoorReflectivePoolExample.id, indoorReflectivePoolExample.riverDescriptor]
  ])("keeps every interior %s surface vertex within the P0 render-parity budget", (exampleId, descriptor) => {
    const data = RiverNetworkCompiler.compile(descriptor).data!;
    const controller = createController(12.5);
    setActiveQueryService(controller, new RiverNetworkQueryService(data));
    const provider = new RiverWaterSurfaceProvider(controller);
    const result = measureRiverRenderParity(provider, data, 12.5);

    expect(result.sampledVertexCount).toBeGreaterThan(0);
    expect(result.missedVertexCount, `${exampleId} has visible vertices that the Provider rejects`).toBe(0);
    expect(result.maxHeightError, `${exampleId} max error at ${result.maxErrorSource}`).toBeLessThanOrEqual(0.05);
    if (exampleId === multiTributaryRiverExample.id) {
      expect(result.overlappingVertexCount).toBeGreaterThan(0);
      expect(result.occludedVertexCount).toBe(0);
      expect(result.sampledJunctionVertexCount).toBeGreaterThan(0);
    }
  });
});
