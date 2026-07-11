import { describe, expect, it } from "vitest";
import { RIVER_FLOW_UV_SCALE } from "../../compiler/river/constants";
import { createLowRiverGeometryData } from "../../compiler/river/RiverGeometryCompiler";
import { sampleRiverPath } from "../../compiler/river/RiverPathSampler";
import { hashRiverGeometryData, hashRiverSamples } from "../../compiler/shared/determinism";
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
    expect({ sampleHash, meshHash }).toEqual({ sampleHash: "28752218", meshHash: "dcddaa19" });
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
});
