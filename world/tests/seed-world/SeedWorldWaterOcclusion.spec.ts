import { BoundingBox, Vector3 } from "@galacean/engine";
import { expect, it } from "vitest";
import { SeedWorldTerrainOcclusionCuller } from "../../../packages/world-planning/src/runtime/SeedWorldTerrainOcclusionCuller";
import {
  sampleSeedWorldHeight,
  type SeedWorldFields
} from "../../../packages/world-planning/src/runtime/SeedWorldFields";

function fixture(gap: boolean, encoded = false, axisX = false, reverse = false) {
  const size = 512,
    resolution = 513,
    origin = -256;
  const surfaceHeights = new Float32Array(resolution ** 2);
  const heightSamples = new Uint16Array(resolution ** 2);
  for (let iz = 0; iz < resolution; iz++)
    for (let ix = 0; ix < resolution; ix++) {
      const a = axisX ? iz + origin : ix + origin;
      const b = (axisX ? ix + origin : iz + origin) * (reverse ? -1 : 1);
      const ridge = b >= 8 && b <= 15 && Math.abs(a) <= 40 && !(gap && a >= 1 && a <= 3);
      surfaceHeights[iz * resolution + ix] = ridge ? 10 : -1;
      heightSamples[iz * resolution + ix] = ridge ? 65535 : 0;
    }
  const fields = {
    sizeMetres: size,
    worldOrigin: [origin, origin],
    heightResolution: resolution,
    heightSamples,
    heightDecode: { offset: -1, scale: 11 },
    ...(encoded ? {} : { surfaceHeights })
  } as unknown as SeedWorldFields;
  const culler = new SeedWorldTerrainOcclusionCuller(fields);
  culler.beginFrame({ x: 0, y: 2, z: 0 });
  const bounds = (near = 19, far = 41) => {
    if (reverse) [near, far] = [-far, -near];
    return axisX
      ? new BoundingBox(new Vector3(near, -1, -21), new Vector3(far, 1, 21))
      : new BoundingBox(new Vector3(-21, -1, near), new Vector3(21, 1, far));
  };
  return { fields, culler, bounds };
}

it.each([false, true])("retains partially visible water on a heightfield (encoded=%s)", (encoded) => {
  const f = fixture(true, encoded);
  expect(f.culler.isWaterBoundsOccluded("gap", f.bounds())).toBe(false);
  // A point strictly inside the water is visible through the ridge gap.
  for (let i = 1; i <= 300; i++) {
    const t = i / 300;
    expect(sampleSeedWorldHeight(f.fields, 5 * t, 30 * t)).toBeLessThan(2 - 2 * t);
  }
});

it.each([false, true])("proves whole-region occlusion on both axes and sides (X=%s)", (axisX) => {
  for (const reverse of [false, true]) {
    const closed = fixture(false, false, axisX, reverse);
    const open = fixture(true, false, axisX, reverse);
    expect(closed.culler.isWaterBoundsOccluded("near", closed.bounds())).toBe(true);
    expect(open.culler.isWaterBoundsOccluded("near", open.bounds())).toBe(false);
    // Water beyond the old near-field cutoff needs the same coverage proof.
    expect(closed.culler.isWaterBoundsOccluded("far", closed.bounds(150, 170))).toBe(true);
    expect(open.culler.isWaterBoundsOccluded("far", open.bounds(150, 170))).toBe(false);
  }
});

it("retains water when terrain coverage, camera data or the work budget cannot prove occlusion", () => {
  const f = fixture(false);
  expect(new SeedWorldTerrainOcclusionCuller(f.fields).isWaterBoundsOccluded("no camera", f.bounds())).toBe(false);
  expect(f.culler.isWaterBoundsOccluded("overhead", f.bounds(-5, 5))).toBe(false);
  expect(
    f.culler.isWaterBoundsOccluded("outside", new BoundingBox(new Vector3(-1000, 0, 19), new Vector3(1000, 0, 41)))
  ).toBe(false);
  f.fields.surfaceHeights!.fill(Number.NaN);
  expect(f.culler.isWaterBoundsOccluded("unknown", f.bounds())).toBe(false);
});

it("retains a water region when its complete cross-section exceeds the vertex budget", () => {
  const fields = {
    sizeMetres: 256,
    worldOrigin: [-128, -128],
    heightResolution: 2049,
    surfaceHeights: new Float32Array(2049 ** 2).fill(100)
  } as unknown as SeedWorldFields;
  const culler = new SeedWorldTerrainOcclusionCuller(fields);
  culler.beginFrame({ x: 0, y: 2, z: 0 });
  expect(
    culler.isWaterBoundsOccluded("budget", new BoundingBox(new Vector3(-128, 0, 20), new Vector3(128, 0, 40)))
  ).toBe(false);
});
