/** Demo-only terrain profile for the retained River showcase. */
export const RIVER_BED_PROFILE = {
  minimumDepth: 0.12,
  depthExponent: 1.5,
  worldUvScale: 1 / 28,
  terrainExtentScale: 3,
  minimumTerrainMargin: 20,
  gridCellSize: 0.52,
  bankHeight: 2.4,
  terrainRelief: 1.05,
  channelCarveScale: 1,
  depthVariation: 0.28,
  geometryNoiseScale: 0.055,
  geometryNoiseSeed: 0x68bc21eb
} as const;

export const WATER_TERRAIN_GRID_STYLE = {
  maxCellsPerAxis: 180,
  minimumDirectionLength: 0.00001,
  minimumElevationBlendRadius: 1
} as const;

export const WATER_TERRAIN_NOISE_STYLE = {
  broadWeight: 0.72,
  detailWeight: 0.28,
  detailScaleMultiplier: 2.61,
  detailSeedOffset: 0x9e3779b9
} as const;

/** Extra high-frequency erosion for the retained close-up River terrain. */
export const RIVER_TERRAIN_DETAIL_STYLE = {
  baseWeight: 0.54,
  fineWeight: 0.28,
  ridgeWeight: 0.18,
  fineScaleMultiplier: 6.2,
  ridgeScaleMultiplier: 2.3,
  fineSeedOffset: 0x7f4a7c15,
  ridgeSeedOffset: 0x165667b1,
  ridgeExponent: 1.45
} as const;

export const WATER_TERRAIN_HASH_STYLE = {
  xMultiplier: 0x9e3779b1,
  zMultiplier: 0x85ebca6b,
  avalancheMultiplierA: 0x7feb352d,
  avalancheMultiplierB: 0x846ca68b,
  unsignedMaximum: 0xffffffff
} as const;

export const RIVER_BED_TEXTURE_STYLE = {
  textureSize: 128,
  darkColor: [42, 40, 32] as const,
  middleColor: [91, 82, 61] as const,
  lightColor: [142, 126, 88] as const,
  broadCellSize: 32,
  mediumCellSize: 8,
  fineCellSize: 2,
  broadSeed: 0x68bc21eb,
  mediumSeed: 0x27d4eb2d,
  fineSeed: 0x165667b1,
  broadWeight: 0.46,
  mediumWeight: 0.32,
  fineWeight: 0.22
} as const;

export const RIVER_BED_MATERIAL_COLOR = [0.6, 0.57, 0.47, 1] as const;
