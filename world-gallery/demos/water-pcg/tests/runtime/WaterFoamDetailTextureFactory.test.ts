import { describe, expect, it } from "vitest";
import {
  buildWaterFoamDetailTexturePixels,
  DEFAULT_WATER_FOAM_DETAIL_TEXTURE_DESCRIPTOR,
  type WaterFoamDetailTextureDescriptor
} from "../../runtime/wave/WaterFoamDetailTextureFactory";

describe("WaterFoamDetailTextureFactory", () => {
  it("builds deterministic independent thick, medium, and light masks", () => {
    const first = buildWaterFoamDetailTexturePixels();
    const second = buildWaterFoamDetailTexturePixels();
    const size =
      DEFAULT_WATER_FOAM_DETAIL_TEXTURE_DESCRIPTOR.size;
    let thickEnergy = 0;
    let mediumEnergy = 0;
    let lightEnergy = 0;
    let differingPixelCount = 0;

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    expect(first).toHaveLength(size * size * 4);
    for (let offset = 0; offset < first.length; offset += 4) {
      thickEnergy += first[offset];
      mediumEnergy += first[offset + 1];
      lightEnergy += first[offset + 2];
      differingPixelCount +=
        first[offset] !== first[offset + 1] ||
        first[offset + 1] !== first[offset + 2]
          ? 1
          : 0;
      expect(first[offset + 3]).toBe(255);
    }
    expect(thickEnergy).toBeGreaterThan(0);
    expect(mediumEnergy).toBeGreaterThan(0);
    expect(lightEnergy).toBeGreaterThan(0);
    expect(differingPixelCount).toBeGreaterThan(
      size * size * 0.8
    );
  });

  it.each([
    { size: 8 },
    { size: 2048 },
    { broadCellCount: 0 },
    { mediumCellCount: 5 },
    { fineCellCount: 13 },
    { seed: Number.NaN }
  ])(
    "rejects invalid or over-budget descriptor override %#",
    (override) => {
      const descriptor = {
        ...DEFAULT_WATER_FOAM_DETAIL_TEXTURE_DESCRIPTOR,
        ...override
      } satisfies WaterFoamDetailTextureDescriptor;

      expect(() =>
        buildWaterFoamDetailTexturePixels(descriptor)
      ).toThrow(/finite|supported budget/);
    }
  );
});
