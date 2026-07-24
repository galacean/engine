import { describe, expect, it } from "vitest";
import { buildHeightfieldWaterSurfaceTexturePixels } from "../../runtime/heightfield/HeightfieldWaterSurfaceTextureFactory";
import { DEFAULT_WATER_SURFACE_DETAIL_TEXTURE_DESCRIPTOR } from "../../runtime/wave/constants/WaterSurfaceDetailTextureConstants";
import {
  buildWaterSurfaceDualSlopeTexturePixels,
  buildWaterSurfaceDetailTexturePixels,
  type WaterSurfaceDetailTextureDescriptor
} from "../../runtime/wave/WaterSurfaceDetailTextureFactory";

function fnv1a(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

describe("WaterSurfaceDetailTextureFactory", () => {
  it("preserves the deterministic Heightfield texture bytes behind the compatibility export", () => {
    const sharedPixels = buildWaterSurfaceDetailTexturePixels();
    const compatibilityPixels = buildHeightfieldWaterSurfaceTexturePixels();

    expect(sharedPixels).toHaveLength(128 * 128 * 4);
    expect(fnv1a(sharedPixels)).toBe("b3926acd");
    expect(compatibilityPixels).toEqual(sharedPixels);
  });

  it("returns independent deterministic CPU buffers for the same descriptor", () => {
    const first = buildWaterSurfaceDetailTexturePixels();
    const second = buildWaterSurfaceDetailTexturePixels();

    expect(first).not.toBe(second);
    expect(second).toEqual(first);
  });

  it("packs two decorrelated signed slope fields into RG and BA", () => {
    const first = buildWaterSurfaceDualSlopeTexturePixels();
    const second =
      buildWaterSurfaceDualSlopeTexturePixels();
    let differingPairCount = 0;
    let secondaryNonNeutralCount = 0;

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    expect(first).toHaveLength(128 * 128 * 4);
    for (let offset = 0; offset < first.length; offset += 4) {
      differingPairCount +=
        first[offset] !== first[offset + 2] ||
        first[offset + 1] !== first[offset + 3]
          ? 1
          : 0;
      secondaryNonNeutralCount +=
        first[offset + 2] !== 128 ||
        first[offset + 3] !== 128
          ? 1
          : 0;
    }
    expect(differingPairCount).toBeGreaterThan(128 * 128 * 0.9);
    expect(secondaryNonNeutralCount).toBeGreaterThan(
      128 * 128 * 0.9
    );
  });

  it.each([
    { size: 3 },
    { size: 2048 },
    { firstCellCount: 0 },
    { secondCellCount: 129 },
    { gradientStrength: -1 },
    { thirdWeight: Number.NaN },
    { firstWeight: 0, secondWeight: 0, thirdWeight: 0 }
  ])("rejects an invalid or over-budget descriptor override %#", (override) => {
    const descriptor = {
      ...DEFAULT_WATER_SURFACE_DETAIL_TEXTURE_DESCRIPTOR,
      ...override
    } satisfies WaterSurfaceDetailTextureDescriptor;

    expect(() => buildWaterSurfaceDetailTexturePixels(descriptor)).toThrow(
      /finite|supported budget/
    );
  });
});
