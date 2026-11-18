import { expect, it } from "vitest";
import {
  float32GridCell,
  interpolateGridTriangle,
  sampleFloat32GridRaster
} from "@galacean/engine-water/water/authoring/terrain/GridInterpolation";

it("preserves triangle interpolation at GPU-rounded edges and large origins without transient descriptors", () => {
  const columns = 17,
    rows = 13,
    samples = Float32Array.from({ length: columns * rows }, (_, i) => Math.sin(i) * 10);
  for (const origin of [
    [-128, -128],
    [1000000.13, -2000000.17]
  ] as const) {
    const grid = { origin, spacing: 0.37, spacingZ: 0.53, columns, rows };
    for (let i = 0; i < 200; i++) {
      const x = Math.fround(origin[0] + (i % 17) * grid.spacing) + ((i % 3) - 1) * 0.00001;
      const z = Math.fround(origin[1] + (i % 13) * grid.spacingZ) + ((i % 3) - 1) * 0.00001;
      const cell = float32GridCell(grid, x, z),
        a = cell.iz * columns + cell.ix,
        c = a + columns;
      const expected = interpolateGridTriangle(samples[a], samples[a + 1], samples[c], samples[c + 1], cell.u, cell.v);
      expect(
        sampleFloat32GridRaster(samples, columns, rows, origin[0], origin[1], grid.spacing, grid.spacingZ, x, z)
      ).toBe(expected);
    }
  }
});

it("retained height and density samplers preserve fractional values, edges and missing heights", async () => {
  const { createSeedWorldHeightSampler, sampleSeedWorldHeight } = await import(
    "../../../packages/world-planning/src/runtime/SeedWorldFields"
  );
  const {
    createSeedWorldDetailDensitySamplerInto,
    createSeedWorldDetailDensitySampler,
    createSeedWorldDetailHeightSamplerInto,
    sampleSeedWorldDetailHeight
  } = await import("../../../packages/world-planning/src/world/SeedWorldDetailCandidateLattice");
  const sample = new Float64Array(3);
  for (const raster of [false, true]) {
    const fields = {
      sizeMetres: 6.4,
      worldOrigin: [10000.13, -20000.17],
      heightResolution: 17,
      heightDecode: { offset: -13.2, scale: 23.7 },
      heightSamples: Uint16Array.from({ length: 17 * 17 }, (_, i) => (i * 231) % 65536),
      surfaceHeights: raster ? Float32Array.from({ length: 17 * 17 }, (_, i) => Math.sin(i) * 3.7) : undefined
    } as any;
    const into = createSeedWorldHeightSampler(fields);
    for (let i = 0; i < 400; i++) {
      sample[0] = fields.worldOrigin[0] + (i % 20) * 0.4 - 0.4;
      sample[1] = fields.worldOrigin[1] + (i % 19) * 0.4 - 0.4;
      const expected = sampleSeedWorldHeight(fields, sample[0], sample[1]);
      expect(into(sample)).toBe(expected !== undefined);
      if (expected !== undefined) expect(sample[2]).toBe(expected);
    }
  }
  const field = {
    resolution: 17,
    maximumDensityPerSquareMetre: 23.7,
    samples: Uint8Array.from({ length: 17 * 17 }, (_, i) => (i * 23) % 255)
  } as any;
  const into = createSeedWorldDetailDensitySamplerInto(field, 6.4),
    scalar = createSeedWorldDetailDensitySampler(field, 6.4);
  for (let i = 0; i < 400; i++) {
    sample[0] = (i % 20) * 0.4 - 4;
    sample[1] = (i % 19) * 0.4 - 4;
    into(sample);
    expect(sample[2]).toBe(scalar(sample[0], sample[1]));
  }
  field.heightRangeMetres = { samples: Float32Array.from({ length: 17 * 17 * 2 }, (_, i) => 0.4 + Math.sin(i) * 0.2) };
  const heightInto = createSeedWorldDetailHeightSamplerInto(field, 6.4)!;
  const heightSample = new Float64Array(4);
  for (let i = 0; i < 400; i++) {
    heightSample[0] = (i % 20) * 0.4 - 0.4;
    heightSample[1] = (i % 19) * 0.4 - 0.4;
    heightInto(heightSample);
    expect(heightSample[2]).toBe(sampleSeedWorldDetailHeight(field, 6.4, heightSample[0], heightSample[1], 0));
    expect(heightSample[3]).toBe(sampleSeedWorldDetailHeight(field, 6.4, heightSample[0], heightSample[1], 1));
  }
});
