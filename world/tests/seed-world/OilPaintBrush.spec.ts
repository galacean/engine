import { describe, expect, it } from "vitest";
import {
  createOilPaintBrushData,
  oilBrushUV,
  oilUnderpaintUV,
  OIL_BRUSH_CELL_SIZE,
  OIL_BRUSH_COLUMNS,
  OIL_BRUSH_COUNT
} from "@galacean/engine-world-planning/spatial/runtime/OilPaintBrush";

describe("oil paint brush atlas", () => {
  it("rebuilds identical linear data after context loss, with valid normals and varied paint", () => {
    const atlas = createOilPaintBrushData();
    expect(createOilPaintBrushData().pixels).toEqual(atlas.pixels);
    const size = OIL_BRUSH_CELL_SIZE;
    for (let cell = 0; cell < OIL_BRUSH_COUNT; cell++) {
      let painted = 0,
        empty = 0,
        normalVariation = 0;
      const pigmentValues = new Set<number>();
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const i =
            ((Math.floor(cell / OIL_BRUSH_COLUMNS) * size + y) * atlas.width + (cell % OIL_BRUSH_COLUMNS) * size + x) *
            4;
          const [r, g, b, a] = atlas.pixels.subarray(i, i + 4);
          const nx = (r / 255) * 2 - 1,
            ny = (g / 255) * 2 - 1;
          // Two-channel normal quantization may exceed the unit disk by one code.
          expect(nx * nx + ny * ny).toBeLessThanOrEqual(1 + 4 / 255);
          if (a > 127) {
            painted++;
            pigmentValues.add(b);
            normalVariation += Math.abs(r - 128) + Math.abs(g - 128);
          } else empty++;
          // Transparent padding prevents neighbouring brush masks leaking at LOD.
          if (x === 0 || y === 0 || x === size - 1 || y === size - 1) expect(a).toBe(0);
        }
      expect(painted).toBeGreaterThan(0);
      expect(empty).toBeGreaterThan(0);
      expect(normalVariation).toBeGreaterThan(painted);
      expect(pigmentValues.size).toBeGreaterThan(1);
    }
  });

  it("maps every stroke into one cell and keeps bark underpainting opaque", () => {
    const { pixels, width, height } = createOilPaintBrushData();
    const alpha = (uv: readonly number[]) =>
      pixels[
        (Math.min(height - 1, Math.floor(uv[1] * height)) * width + Math.min(width - 1, Math.floor(uv[0] * width))) *
          4 +
          3
      ];
    for (let cell = 0; cell < OIL_BRUSH_COUNT; cell++) {
      const seed = (cell + 0.5) / OIL_BRUSH_COUNT;
      const lower = oilBrushUV(0, 0, seed),
        upper = oilBrushUV(1, 1, seed);
      expect(Math.floor(lower[0] * OIL_BRUSH_COLUMNS)).toBe(cell % OIL_BRUSH_COLUMNS);
      expect(upper[0] - lower[0]).toBeCloseTo(1 / OIL_BRUSH_COLUMNS);
      expect(alpha(oilBrushUV(0.5, 0.5, seed))).toBeGreaterThan(127);
    }
    for (const u of [0, 0.25, 0.5, 0.75, 1])
      for (const v of [0, 0.25, 0.5, 0.75, 1]) {
        expect(alpha(oilUnderpaintUV(u, v))).toBe(255);
      }
  });
});
