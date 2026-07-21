/** Demo-only decoration profiles and visual tuning shared by water examples. */
export enum WaterDecorationStyle {
  River = "river",
  HeightfieldRiver = "heightfield-river",
  Pool = "pool"
}

export const WATER_BED_PROFILE = {
  [WaterDecorationStyle.River]: {
    minimumDepth: 0.08,
    crossSectionFractions: [1, 0.65, 0, -0.65, -1] as const,
    depthExponent: 1.35,
    flat: false,
    worldUvScale: 0.085,
    terrainExtentScale: 4.5,
    minimumTerrainMargin: 18,
    gridCellSize: 0.9,
    bankHeight: 1.55,
    terrainRelief: 0.9,
    channelCarveScale: 1.6,
    depthVariation: 0.42,
    geometryNoiseScale: 0.075,
    geometryNoiseSeed: 0x41c64e6d
  },
  [WaterDecorationStyle.HeightfieldRiver]: {
    minimumDepth: 0.12,
    crossSectionFractions: [1, 0.65, 0, -0.65, -1] as const,
    depthExponent: 1.5,
    flat: false,
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
  },
  [WaterDecorationStyle.Pool]: {
    minimumDepth: 2.2,
    crossSectionFractions: [1, 0.5, 0, -0.5, -1] as const,
    depthExponent: 1,
    flat: true,
    worldUvScale: 0.08,
    terrainExtentScale: 1,
    minimumTerrainMargin: 0,
    gridCellSize: 1,
    bankHeight: 0,
    terrainRelief: 0,
    channelCarveScale: 1,
    depthVariation: 0,
    geometryNoiseScale: 0.1,
    geometryNoiseSeed: 0x3c6ef372
  }
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

/** Extra high-frequency erosion used only by the close-up high-difference river terrain. */
export const HEIGHTFIELD_RIVER_TERRAIN_DETAIL_STYLE = {
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
  textureSize: 64,
  darkColor: [40, 38, 31] as const,
  middleColor: [67, 62, 49] as const,
  lightColor: [101, 91, 68] as const,
  broadCellSize: 16,
  mediumCellSize: 8,
  fineCellSize: 4,
  broadSeed: 0x243f6a88,
  mediumSeed: 0x85a308d3,
  fineSeed: 0x13198a2e,
  broadWeight: 0.55,
  mediumWeight: 0.3,
  fineWeight: 0.15
} as const;

export const HEIGHTFIELD_RIVER_BED_TEXTURE_STYLE = {
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

export const WATER_BED_MATERIAL_COLOR = {
  [WaterDecorationStyle.River]: [0.8, 0.79, 0.74, 1] as const,
  [WaterDecorationStyle.HeightfieldRiver]: [0.6, 0.57, 0.47, 1] as const,
  [WaterDecorationStyle.Pool]: [0.82, 0.9, 0.9, 1] as const
} as const;

export const POOL_BED_TEXTURE_STYLE = {
  textureSize: 64,
  tileCount: 4,
  groutWidth: 2,
  groutColor: [143, 181, 188, 255] as const,
  tileColor: [202, 220, 220, 255] as const,
  tileHighlightColor: [221, 235, 235, 255] as const,
  highlightModulo: 3
} as const;

export const POOL_SCENE_STYLE = {
  copingWidth: 1.15,
  copingHeight: 0.34,
  deckWidth: 5.5,
  deckHeight: 0.24,
  wallThickness: 0.24,
  minimumDirectionLength: 0.00001,
  deckColor: [0.82, 0.8, 0.72, 1] as const,
  copingColor: [0.96, 0.97, 0.93, 1] as const,
  wallColor: [0.64, 0.88, 0.93, 1] as const,
  specularColor: [0.22, 0.25, 0.25, 1] as const,
  deckShininess: 28,
  wallShininess: 42,
  emissiveScale: 0.12,
  lightColor: [1, 0.98, 0.9, 1] as const,
  lightRotation: [-58, -24, 0] as const,
  ladderRadius: 0.09,
  ladderRailHeight: 3.3,
  ladderRailSpacing: 3.2,
  ladderAboveWater: 1.55,
  ladderInset: 0.34,
  ladderRungCount: 4,
  ladderRungSpacing: 0.48,
  ladderColor: [0.68, 0.73, 0.74, 1] as const,
  ladderSpecularColor: [0.9, 0.95, 0.96, 1] as const,
  ladderShininess: 96
} as const;
