import { expect, it } from "vitest";
import {
  sampleSeedWorldTerrainNormal,
  sampleTerrestrialGrassSurfaceWeights
} from "../../../packages/world-planning/src/runtime/SeedWorldGrassSampling";

it("samples native grass normals and material weights without changing their terrain meaning", () => {
  const fields = {
    sizeMetres: 16,
    worldOrigin: [-8, 0],
    heightResolution: 17,
    surfaceResolution: 17,
    surfaceHeights: Float32Array.from({ length: 17 * 17 }, (_, i) => (i % 17) * 0.25 + Math.floor(i / 17) * 0.5),
    materialWeights: Uint8Array.from({ length: 17 * 17 * 4 }, (_, i) => (i % 4 === 0 ? 128 : i % 4 === 3 ? 64 : 0)),
    rockySlopeWeight: new Uint8Array(17 * 17)
  } as any;
  const normal: [number, number, number] = [0, 0, 0],
    weights: [number, number, number] = [0, 0, 0];
  const length = Math.hypot(0.25, 1, 0.5);
  for (const x of [-6.7, -2.3, 0.3, 5.1])
    for (const z of [1.1, 4.6, 11.2, 14.9]) {
      sampleSeedWorldTerrainNormal(fields, x, z, normal);
      expect(normal[0]).toBeCloseTo(-0.25 / length, 12);
      expect(normal[1]).toBeCloseTo(1 / length, 12);
      expect(normal[2]).toBeCloseTo(-0.5 / length, 12);
      sampleTerrestrialGrassSurfaceWeights(fields, x, z, weights);
      expect(weights[0]).toBeCloseTo(128 / 255, 15);
      expect(weights[1]).toBeCloseTo(64 / 255, 15);
      expect(weights[2]).toBeCloseTo(63 / 255, 15);
    }
});
