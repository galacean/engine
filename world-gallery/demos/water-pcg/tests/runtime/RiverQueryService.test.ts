import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { RiverGeometryCompiler } from "../../compiler/river/RiverGeometryCompiler";
import { RiverChunkSourceKind, RiverQueryPrimitiveKind } from "../../compiler/river/RiverGeometryEnums";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { sampleRiverPath } from "../../compiler/river/RiverPathSampler";
import {
  createRiverNetworkQueryBatchOutput,
  createRiverNetworkQueryResult,
  queryRiver,
  RiverNetworkQueryService
} from "../../runtime/river/RiverQueryService";
import type { RiverDemoConfig as RiverConfig } from "../../demo/types";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { straightFixture, variableProfileFixture } from "../fixtures/riverFixtures";

describe("WaterQuery flow contract", () => {
  it("preserves zero flow as a true stopped-water value", () => {
    const config: RiverConfig = {
      ...straightFixture,
      flow: { ...straightFixture.flow, speed: 0 },
      path: {
        ...straightFixture.path,
        points: straightFixture.path.points.map((point) => ({ ...point, flowSpeed: undefined }))
      }
    };
    const sampleResult = sampleRiverPath(config);
    const source = RiverGeometryCompiler.compile(sampleResult, config.quality.material.level).querySource;
    const result = queryRiver(source, new Vector3(5, 0, 0));

    expect(result.inWater).toBe(true);
    expect(result.flowSpeed).toBe(0);
  });

  it("returns the same authored local flow profile encoded by sampled geometry", () => {
    const samples = sampleRiverPath(variableProfileFixture).points;
    const anchor = variableProfileFixture.path.points[1];
    const anchorSample = samples.find(
      (sample) =>
        sample.position.x === anchor.position[0] &&
        sample.position.y === anchor.position[1] &&
        sample.position.z === anchor.position[2]
    );
    if (!anchorSample) throw new Error("Expected preserved anchor sample.");
    const source = RiverGeometryCompiler.compile(
      { points: samples, totalLength: samples.at(-1)?.distance ?? 0, diagnostics: [] },
      variableProfileFixture.quality.material.level
    ).querySource;
    const result = queryRiver(source, anchorSample.position);

    expect(result.flowSpeed).toBeCloseTo(anchor.flowSpeed!);
  });
});

describe("RiverNetworkQueryService", () => {
  it("separates horizontal footprint, vertical surface distance, and bounded submerged depth", () => {
    const data = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const service = new RiverNetworkQueryService(data);
    const sample = data.reaches[0].artifact.samples[5];
    const result = createRiverNetworkQueryResult();
    const position = new Vector3(sample.position[0], sample.position[1] + 2, sample.position[2]);

    expect(service.sampleSurface(position, result)).toBe(true);
    expect(result.waterBodyId).toBe(data.sourceId);
    expect(result.segmentId).toBe(data.reaches[0].id);
    expect(result.sourceKind).toBe(RiverChunkSourceKind.Reach);
    expect(result.insideFootprint).toBe(true);
    expect(result.insideVolume).toBe(false);
    expect(result.signedSurfaceDistance).toBeCloseTo(2);
    expect(result.submergedDepth).toBe(0);

    position.y = sample.position[1];
    expect(service.containsVolume(position, result)).toBe(true);

    position.y = sample.position[1] - Math.min(0.2, result.waterDepth * 0.5);
    expect(service.containsVolume(position, result)).toBe(true);
    expect(result.signedSurfaceDistance).toBeLessThan(0);
    expect(result.submergedDepth).toBeGreaterThan(0);
    expect(result.submergedDepth).toBeLessThanOrEqual(result.waterDepth);
  });

  it("queries confluence patches as first-class water footprints", () => {
    const data = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const service = new RiverNetworkQueryService(data);
    const junction = data.junctions[0];
    const result = createRiverNetworkQueryResult();

    service.sampleSurface(
      new Vector3(junction.position[0], junction.position[1] - 0.1, junction.position[2]),
      result
    );

    expect(result.hit).toBe(true);
    expect(result.sourceKind).toBe(RiverChunkSourceKind.Junction);
    expect(result.segmentId).toBe(junction.id);
    expect(result.insideFootprint).toBe(true);
    expect(result.flowVector.length()).toBeCloseTo(junction.flowSpeed);
    expect(result.surfaceNormal).toMatchObject({ x: 0, y: 1, z: 0 });
  });

  it("matches the brute-force reference across deterministic randomized positions", () => {
    const data = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const service = new RiverNetworkQueryService(data);
    const indexed = createRiverNetworkQueryResult();
    const bruteForce = createRiverNetworkQueryResult();
    let seed = 0x12345678;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let index = 0; index < 500; index++) {
      const position = new Vector3(-70 + random() * 150, -2 + random() * 8, -55 + random() * 120);
      service.sampleSurface(position, indexed);
      service.sampleSurfaceBruteForce(position, bruteForce);
      expect(indexed.hit).toBe(bruteForce.hit);
      expect(indexed.segmentId).toBe(bruteForce.segmentId);
      expect(indexed.insideFootprint).toBe(bruteForce.insideFootprint);
      if (indexed.hit) {
        expect(indexed.surfaceHeight).toBeCloseTo(bruteForce.surfaceHeight, 6);
        expect(indexed.distanceToBank).toBeCloseTo(bruteForce.distanceToBank, 6);
        expect(indexed.flowVector.x).toBeCloseTo(bruteForce.flowVector.x, 6);
        expect(indexed.flowVector.z).toBeCloseTo(bruteForce.flowVector.z, 6);
      }
    }
  });

  it("writes batch results into reusable typed arrays without replacing caller-owned vectors", () => {
    const data = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const service = new RiverNetworkQueryService(data);
    const firstSample = data.reaches[0].artifact.samples[4];
    const junction = data.junctions[0];
    const positions = new Float32Array([
      firstSample.position[0],
      firstSample.position[1] - 0.1,
      firstSample.position[2],
      junction.position[0],
      junction.position[1] - 0.1,
      junction.position[2],
      1000,
      0,
      1000
    ]);
    const batch = createRiverNetworkQueryBatchOutput(3);
    const scalar = createRiverNetworkQueryResult();
    const originalFlowVector = scalar.flowVector;
    const originalSurfaceNormal = scalar.surfaceNormal;

    expect(service.queryBatch(positions, batch)).toBe(3);
    expect(Array.from(batch.hits)).toEqual([1, 1, 0]);
    expect(Array.from(batch.insideFootprints)).toEqual([1, 1, 0]);
    expect(batch.sourceIndices[0]).toBe(0);
    expect(batch.sourceKinds[1]).toBe(RiverQueryPrimitiveKind.Junction);

    const scalarPosition = new Vector3(firstSample.position[0], firstSample.position[1], firstSample.position[2]);
    for (let index = 0; index < 100; index++) {
      service.sampleSurface(scalarPosition, scalar);
    }
    expect(scalar.flowVector).toBe(originalFlowVector);
    expect(scalar.surfaceNormal).toBe(originalSurfaceNormal);
  });
});
