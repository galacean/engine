import { describe, expect, it } from "vitest";
import {
  RIVER_FLOW_UV_SCALE,
  RIVER_GEOMETRY_Y_OFFSET,
  RIVER_RIBBON_MITER_LIMIT,
  RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY
} from "../../compiler/river/constants";
import { createLowRiverGeometryData, RiverGeometryCompiler } from "../../compiler/river/RiverGeometryCompiler";
import { sampleRiverPath } from "../../compiler/river/RiverPathSampler";
import { resolveRiverRibbonJoinFrame } from "../../compiler/river/RiverRibbonJoinResolver";
import { hashRiverGeometryData, hashRiverSamples } from "../../compiler/shared/determinism";
import { RiverDiagnosticCode } from "../../compiler/shared/diagnostics";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { sharpBendFixture, straightFixture, variableProfileFixture, webGL1LowFixture } from "../fixtures/riverFixtures";

describe("RiverGeometryCompiler", () => {
  it.each([straightFixture, sharpBendFixture, webGL1LowFixture])(
    "generates finite, indexed, non-degenerate Low mesh for $id",
    (fixture) => {
      const samples = sampleRiverPath(fixture).points;
      const mesh = createLowRiverGeometryData(samples);
      expect(mesh.positions.length).toBe(samples.length * 4);
      expect(mesh.positions.every((position) => Number.isFinite(position[0] + position[1] + position[2]))).toBe(true);
      const indices = Array.from(mesh.indices);
      expect(indices.every((index) => index >= 0 && index < mesh.positions.length && index <= 65535)).toBe(true);
      for (let i = 0; i < indices.length; i += 3) {
        const a = mesh.positions[indices[i]];
        const b = mesh.positions[indices[i + 1]];
        const c = mesh.positions[indices[i + 2]];
        const area = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]));
        expect(area).toBeGreaterThan(1e-8);
      }
    }
  );

  it("produces deterministic sample and mesh hashes", () => {
    const first = sampleRiverPath(variableProfileFixture).points;
    const second = sampleRiverPath(variableProfileFixture).points;
    const sampleHash = hashRiverSamples(first);
    const meshHash = hashRiverGeometryData(createLowRiverGeometryData(first));
    expect(sampleHash).toBe(hashRiverSamples(second));
    expect(meshHash).toBe(hashRiverGeometryData(createLowRiverGeometryData(second)));
    expect({ sampleHash, meshHash }).toEqual({ sampleHash: "0e2403b2", meshHash: "06911b4d" });
  });

  it.each([RiverQualityLevel.Medium, RiverQualityLevel.High])(
    "builds a cross-river grid with motion attributes and displacement-safe bounds for %s",
    (level) => {
      const sampleResult = sampleRiverPath(variableProfileFixture);
      const maxDisplacement = 0.35;
      const artifact = RiverGeometryCompiler.compile(sampleResult, level, 0, 0, {
        materialLevel: level,
        maxDisplacement
      });
      const geometry = artifact.surfaceGeometry;
      const rowWidth = RIVER_SURFACE_CROSS_SEGMENTS_BY_QUALITY[level] + 1;

      expect(geometry.positions).toHaveLength(sampleResult.points.length * rowWidth);
      expect(geometry.normals).toHaveLength(geometry.positions.length);
      expect(geometry.tangents).toHaveLength(geometry.positions.length);
      expect(geometry.uv2s).toHaveLength(geometry.positions.length);
      expect(geometry.uv3s).toHaveLength(geometry.positions.length);
      expect(geometry.maxDisplacement).toBe(maxDisplacement);
      expect(geometry.uv2s?.[0][0]).toBeCloseTo(sampleResult.points[0].width * 0.5);
      expect(geometry.uv2s?.[rowWidth - 1][0]).toBeCloseTo(-sampleResult.points[0].width * 0.5);
      expect(geometry.uv3s?.[0][0]).toBeCloseTo(sampleResult.points[0].width * 0.5);
      expect(geometry.uv3s?.[0][1]).toBeCloseTo(sampleResult.points[0].depth);
      expect(geometry.uv3s?.at(-1)?.[1]).toBeCloseTo(sampleResult.points.at(-1)!.depth);
      expect(geometry.bounds.min[1]).toBeLessThanOrEqual(
        sampleResult.points[0].position.y + RIVER_GEOMETRY_Y_OFFSET.surface - maxDisplacement
      );
      expect(geometry.bounds.max[1]).toBeGreaterThanOrEqual(
        Math.max(...sampleResult.points.map((sample) => sample.position.y)) +
          RIVER_GEOMETRY_Y_OFFSET.surface +
          maxDisplacement
      );
    }
  );

  it("encodes continuous advective phase in UV0 and preserves network distance in UV1", () => {
    const samples = sampleRiverPath(variableProfileFixture).points;
    const networkDistanceOffset = 10;
    const networkFlowTimeOffset = 3;
    const mesh = createLowRiverGeometryData(samples, networkDistanceOffset, networkFlowTimeOffset, true);

    expect(mesh.uvs[0][1]).toBeCloseTo(networkFlowTimeOffset * RIVER_FLOW_UV_SCALE);
    expect(mesh.uvs.at(-1)?.[1]).toBeCloseTo(
      (networkFlowTimeOffset + samples.at(-1)!.flowTravelTime) * RIVER_FLOW_UV_SCALE
    );
    expect(mesh.uv1s[0][0]).toBeCloseTo(samples[0].flowSpeed);
    expect(mesh.uv1s[0][1]).toBeCloseTo(networkDistanceOffset);
    expect(mesh.uv1s.at(-1)?.[1]).toBeCloseTo(networkDistanceOffset + samples.at(-1)!.distance);
    expect(mesh.uv3s?.[0][1]).toBeCloseTo(samples[0].depth);
    expect(mesh.uv3s?.at(-1)?.[1]).toBeCloseTo(samples.at(-1)!.depth);
  });

  it("keeps variable-speed flow travel time monotonic from source to mouth", () => {
    const samples = sampleRiverPath(variableProfileFixture).points;

    expect(samples[0].flowTravelTime).toBe(0);
    for (let index = 1; index < samples.length; index++) {
      expect(samples[index].flowTravelTime).toBeGreaterThan(samples[index - 1].flowTravelTime);
      expect(samples[index].distance).toBeGreaterThan(samples[index - 1].distance);
    }
  });

  it("bounds acute-turn ribbon expansion with the compiler miter limit", () => {
    const samples = sampleRiverPath(sharpBendFixture).points;
    const bendIndex = samples.findIndex((sample) => sample.position.x === 4 && sample.position.z === 0);
    const join = resolveRiverRibbonJoinFrame(samples, bendIndex);

    expect(bendIndex).toBeGreaterThan(0);
    expect(join.usedFallback).toBe(false);
    expect(join.widthScale).toBeCloseTo(Math.SQRT2);
    expect(join.widthScale).toBeLessThanOrEqual(RIVER_RIBBON_MITER_LIMIT);
  });

  it("uses a bounded fallback for a near reversal", () => {
    const fixture = {
      ...sharpBendFixture,
      path: {
        ...sharpBendFixture.path,
        points: [
          { id: "start", position: [0, 0, 0] as [number, number, number] },
          { id: "bend", position: [4, 0, 0] as [number, number, number] },
          { id: "end", position: [0.1, 0, 0.1] as [number, number, number] }
        ]
      }
    };
    const sampleResult = sampleRiverPath(fixture);
    const samples = sampleResult.points;
    const bendIndex = samples.findIndex((sample) => sample.position.x === 4 && sample.position.z === 0);
    const join = resolveRiverRibbonJoinFrame(samples, bendIndex);
    const mesh = createLowRiverGeometryData(samples);
    const artifact = RiverGeometryCompiler.compile(sampleResult, RiverQualityLevel.Low);

    expect(join.usedFallback).toBe(true);
    expect(join.widthScale).toBe(RIVER_RIBBON_MITER_LIMIT);
    expect(mesh.positions.every((position) => Number.isFinite(position[0] + position[1] + position[2]))).toBe(true);
    expect(artifact.geometryAnalysis.sharpBendFallbackCount).toBeGreaterThan(0);
    expect(artifact.geometryAnalysis.degenerateTriangleCount).toBe(0);
    expect(artifact.diagnostics.map((diagnostic) => diagnostic.code)).toContain(RiverDiagnosticCode.SharpBendFallback);
  });
});
