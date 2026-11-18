import { bakeTerrainHeightfield, compileTerrainFbm, createFbm2D } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

describe("Terrain authoring", () => {
  it("preserves the seeded value-noise kernel", () => {
    expect(createFbm2D({ seed: 0, octaves: 1 })(0, 0)).toBe(-1);
    expect(createFbm2D({ seed: 173, octaves: 4 })(0.37, -2.8)).toBe(-0.06417770899972786);
    expect(createFbm2D({ seed: -1, octaves: 6 })(-17.25, 0.125)).toBe(0.2576648684073115);
    expect(createFbm2D({ seed: 0xffff_ffff, octaves: 6 })(-17.25, 0.125)).toBe(0.2576648684073115);
  });

  it("uses the configured frequency and weight for additional octaves", () => {
    const seed = 173;
    const first = createFbm2D({ seed, octaves: 1 });
    const second = createFbm2D({ seed: seed + Math.imul(1, 0x9e37_79b1), octaves: 1 });
    const sample = createFbm2D({ seed, octaves: 2, lacunarity: 3, persistence: 0.2 });
    const x = 0.37;
    const z = -2.8;
    expect(sample(x, z)).toBeCloseTo((first(x, z) + 0.2 * second(x * 3, z * 3)) / 1.2, 14);
  });

  it("compiles a detached recipe with independent warp axes", () => {
    const band = { seed: 5, octaves: 3, wavelengthMetres: 45, amplitudeMetres: 7 };
    const warpX = { seed: 7, octaves: 2, wavelengthMetres: 80, amplitudeMetres: 20 };
    const warpZ = { ...warpX, seed: 11 };
    const x = -18;
    const z = 16;
    const warp = (axis: typeof warpX) =>
      axis.amplitudeMetres * createFbm2D(axis)(x / axis.wavelengthMetres, z / axis.wavelengthMetres);
    const expected =
      12 +
      band.amplitudeMetres *
        createFbm2D(band)((x + warp(warpX)) / band.wavelengthMetres, (z + warp(warpZ)) / band.wavelengthMetres);
    const sample = compileTerrainFbm({ baseHeightMetres: 12, bands: [band], domainWarp: { x: warpX, z: warpZ } });
    band.amplitudeMetres = 100;
    warpX.seed = 100;

    expect(sample(x, z)).toBe(expected);
  });

  it("bakes an inclusive, X-fast grid with detached geometry and heights", () => {
    const origin: [number, number] = [-4, 12];
    const grid = { origin, spacing: 1.25, spacingZ: 6, columns: 3, rows: 2 };
    const visited: [number, number][] = [];
    const first = bakeTerrainHeightfield(grid, (x, z, column, row) => {
      visited.push([column, row]);
      return x + z / 2;
    });
    const second = bakeTerrainHeightfield(grid, (x, z) => x + z / 2);
    origin[0] = 0;

    expect(first.origin).toEqual([-4, 12]);
    expect(visited).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1]
    ]);
    expect(first.heights).toEqual(new Float32Array([2, 3.25, 4.5, 5, 6.25, 7.5]));
    first.heights[0] = 1;
    expect(second.heights[0]).toBe(2);
  });

  it("writes identical shared-edge heights in separate bakes at different X spacings", () => {
    const source = { bands: [{ seed: 9, octaves: 4, wavelengthMetres: 32, amplitudeMetres: 8 }] };
    const left = bakeTerrainHeightfield(
      { origin: [-32, 16], spacing: 4, spacingZ: 3, columns: 9, rows: 5 },
      compileTerrainFbm(source)
    );
    const right = bakeTerrainHeightfield(
      { origin: [0, 16], spacing: 2, spacingZ: 3, columns: 17, rows: 5 },
      compileTerrainFbm(source)
    );
    for (let row = 0; row < left.rows; row++) {
      expect(left.heights[(row + 1) * left.columns - 1]).toBe(right.heights[row * right.columns]);
    }
  });

  it("rejects invalid source settings, grids and heights", () => {
    const grid = { origin: [0, 0] as const, spacing: 1, columns: 2, rows: 2 };
    expect(() => createFbm2D({ seed: 0, octaves: 0 })).toThrow(RangeError);
    expect(() =>
      compileTerrainFbm({ bands: [{ seed: 0, octaves: 1, wavelengthMetres: 0, amplitudeMetres: 5 }] })
    ).toThrow(RangeError);
    expect(() => bakeTerrainHeightfield({ ...grid, columns: 1 }, () => 0)).toThrow(RangeError);
    expect(() => bakeTerrainHeightfield({ ...grid, origin: [2 ** 54, 0] }, () => 0)).toThrow(RangeError);
    expect(() => bakeTerrainHeightfield(grid, () => 1e40)).toThrow(RangeError);
  });
});
