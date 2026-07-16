/** Demo-only decoration profiles and visual tuning shared by water examples. */
export enum WaterDecorationStyle {
  River = "river",
  Lake = "lake",
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
  [WaterDecorationStyle.Lake]: {
    minimumDepth: 0.16,
    crossSectionFractions: [1, 0.72, 0.38, 0, -0.38, -0.72, -1] as const,
    depthExponent: 2,
    flat: false,
    worldUvScale: 0.07,
    terrainExtentScale: 1.8,
    minimumTerrainMargin: 24,
    gridCellSize: 1.2,
    bankHeight: 0.85,
    terrainRelief: 0.45,
    channelCarveScale: 1.3,
    depthVariation: 0.3,
    geometryNoiseScale: 0.04,
    geometryNoiseSeed: 0x6a09e667
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

export const LAKE_BED_TEXTURE_STYLE = {
  textureSize: 64,
  darkColor: [35, 42, 37] as const,
  middleColor: [58, 66, 55] as const,
  lightColor: [88, 94, 74] as const,
  broadCellSize: 16,
  mediumCellSize: 8,
  fineCellSize: 4,
  broadSeed: 0x6a09e667,
  mediumSeed: 0xbb67ae85,
  fineSeed: 0x3c6ef372,
  broadWeight: 0.55,
  mediumWeight: 0.3,
  fineWeight: 0.15
} as const;

export const WATER_BED_MATERIAL_COLOR = {
  [WaterDecorationStyle.River]: [0.8, 0.79, 0.74, 1] as const,
  [WaterDecorationStyle.Lake]: [0.78, 0.81, 0.75, 1] as const,
  [WaterDecorationStyle.Pool]: [0.46, 0.76, 0.83, 1] as const
} as const;

export const POOL_BED_TEXTURE_STYLE = {
  textureSize: 64,
  tileCount: 4,
  groutWidth: 2,
  groutColor: [184, 226, 232, 255] as const,
  tileColor: [105, 206, 226, 255] as const,
  tileHighlightColor: [132, 220, 237, 255] as const,
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

export const LAKE_PILLAR_LAYOUT = [
  { sampleFraction: 0.38, lateralFraction: -0.18, radius: 1.15, heightAboveWater: 2.4, rotationY: 12 },
  { sampleFraction: 0.46, lateralFraction: 0.22, radius: 0.86, heightAboveWater: 3.6, rotationY: 48 },
  { sampleFraction: 0.52, lateralFraction: -0.04, radius: 1.32, heightAboveWater: 1.8, rotationY: 83 },
  { sampleFraction: 0.59, lateralFraction: 0.3, radius: 1.02, heightAboveWater: 2.9, rotationY: 126 },
  { sampleFraction: 0.65, lateralFraction: -0.27, radius: 0.78, heightAboveWater: 4.2, rotationY: 171 }
] as const;

export const LAKE_PILLAR_STYLE = {
  radiusTop: 0.82,
  radiusBottom: 1,
  meshHeight: 1,
  radialSegments: 7,
  heightSegments: 1,
  minDirectionLength: 0.00001,
  baseColor: [0.26, 0.25, 0.22, 1] as const,
  specularColor: [0.16, 0.17, 0.16, 1] as const,
  emissiveColor: [0.012, 0.011, 0.009, 1] as const,
  shininess: 18,
  lightColor: [0.86, 0.84, 0.77, 1] as const,
  lightRotation: [-48, -32, 0] as const
} as const;
