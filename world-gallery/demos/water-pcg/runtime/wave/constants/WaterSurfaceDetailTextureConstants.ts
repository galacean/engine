/** Deterministic defaults for the shared, tileable water-surface detail texture. */
export const DEFAULT_WATER_SURFACE_DETAIL_TEXTURE_DESCRIPTOR = Object.freeze({
  size: 128,
  gradientStrength: 6.8,
  firstCellCount: 4,
  secondCellCount: 11,
  thirdCellCount: 23,
  firstWeight: 0.5,
  secondWeight: 0.32,
  thirdWeight: 0.18,
  firstSeed: 13,
  secondSeed: 37,
  thirdSeed: 71,
  auxiliarySeedOffset: 101
});

export const WATER_SURFACE_DUAL_SLOPE_TEXTURE_RESOURCE_BYTES =
  Math.round(
    DEFAULT_WATER_SURFACE_DETAIL_TEXTURE_DESCRIPTOR.size **
      2 *
      4 *
      (4 / 3)
  );
