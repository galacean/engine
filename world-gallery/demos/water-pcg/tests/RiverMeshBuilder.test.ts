import { describe, expect, it } from "vitest";
import { RIVER_FLOW_UV_SCALE } from "../river/constants";
import { hashRiverMeshData, hashRiverSamples } from "../river/RiverDeterminism";
import { createLowRiverMeshData } from "../river/RiverMeshBuilder";
import { sampleRiverPath } from "../river/RiverPathSampler";
import { sharpBendFixture, straightFixture, variableProfileFixture, webGL1LowFixture } from "./fixtures/riverFixtures";

describe("RiverMeshBuilder", () => {
  it.each([straightFixture, sharpBendFixture, webGL1LowFixture])(
    "generates finite, indexed, non-degenerate Low mesh for $id",
    (fixture) => {
      const samples = sampleRiverPath(fixture).points;
      const mesh = createLowRiverMeshData(samples);
      expect(mesh.positions.length).toBe(samples.length * 4);
      expect(mesh.positions.every((position) => Number.isFinite(position.x + position.y + position.z))).toBe(true);
      expect(mesh.indices.every((index) => index >= 0 && index < mesh.positions.length && index <= 65535)).toBe(true);
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const a = mesh.positions[mesh.indices[i]];
        const b = mesh.positions[mesh.indices[i + 1]];
        const c = mesh.positions[mesh.indices[i + 2]];
        const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
        expect(area).toBeGreaterThan(1e-8);
      }
    }
  );

  it("produces deterministic sample and mesh hashes", () => {
    const first = sampleRiverPath(variableProfileFixture).points;
    const second = sampleRiverPath(variableProfileFixture).points;
    const sampleHash = hashRiverSamples(first);
    const meshHash = hashRiverMeshData(createLowRiverMeshData(first));
    expect(sampleHash).toBe(hashRiverSamples(second));
    expect(meshHash).toBe(hashRiverMeshData(createLowRiverMeshData(second)));
    expect({ sampleHash, meshHash }).toEqual({ sampleHash: "28752218", meshHash: "dcddaa19" });
  });

  it("encodes local flow speed and continuous network distance in UV1", () => {
    const samples = sampleRiverPath(variableProfileFixture).points;
    const networkDistanceOffset = 10;
    const mesh = createLowRiverMeshData(samples, undefined, networkDistanceOffset);

    expect(mesh.uvs[0].y).toBeCloseTo(networkDistanceOffset * RIVER_FLOW_UV_SCALE);
    expect(mesh.uv1s?.[0].x).toBeCloseTo(samples[0].flowSpeed);
    expect(mesh.uv1s?.[0].y).toBeCloseTo(networkDistanceOffset);
    expect(mesh.uv1s?.at(-1)?.y).toBeCloseTo(networkDistanceOffset + samples.at(-1)!.distance);
  });
});
