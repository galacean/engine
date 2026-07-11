import { describe, expect, it } from "vitest";
import { RIVER_FLOW_UV_SCALE, RIVER_RIBBON_MITER_LIMIT } from "../../compiler/river/constants";
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
    expect({ sampleHash, meshHash }).toEqual({ sampleHash: "28752218", meshHash: "3b5685c5" });
  });

  it("encodes local flow speed and continuous network distance in UV1", () => {
    const samples = sampleRiverPath(variableProfileFixture).points;
    const networkDistanceOffset = 10;
    const mesh = createLowRiverGeometryData(samples, networkDistanceOffset);

    expect(mesh.uvs[0][1]).toBeCloseTo(networkDistanceOffset * RIVER_FLOW_UV_SCALE);
    expect(mesh.uv1s[0][0]).toBeCloseTo(samples[0].flowSpeed);
    expect(mesh.uv1s[0][1]).toBeCloseTo(networkDistanceOffset);
    expect(mesh.uv1s.at(-1)?.[1]).toBeCloseTo(networkDistanceOffset + samples.at(-1)!.distance);
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
