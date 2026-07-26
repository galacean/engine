import {
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCoastalAlphaModel,
  WaterSurfaceContactFoamModel,
  WaterSurfaceDepthTintModel,
  WaterSurfaceNormalModel,
  WaterSurfaceNormalSampling,
  type WaterSurfaceAppearanceAssetV1
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";

export const grasslandsSurfaceAppearanceFixture = {
  schemaVersion: WaterSurfaceAppearanceSchemaVersion.V1,
  id: "grasslands-stylized-water",
  normal: {
    model: WaterSurfaceNormalModel.ExternalTangentNormal,
    textureAssetId: "grasslands-water-normal-1024",
    textureContentHash: "0d9bfdded6d8c46cff4afe145cf052ec31f079ae03d89b73599ccb7807c02332",
    sampling: WaterSurfaceNormalSampling.WorldXzMirroredDual,
    tiling: 0.05,
    scrollUvPerSecond: 0.02,
    strength: 0.2,
    flipGreen: false
  },
  depthTint: {
    model: WaterSurfaceDepthTintModel.SceneDepthPower,
    color: [0.21710525, 0.45953944, 0.55, 1],
    distance: 10,
    exponent: 0.5
  },
  coastalAlpha: {
    model: WaterSurfaceCoastalAlphaModel.SceneDepth,
    distance: 0.5
  },
  contactFoam: {
    model: WaterSurfaceContactFoamModel.SceneDepthVoronoi,
    worldScale: 2.5,
    timeRate: 1,
    opacity: 0.453,
    contactDistance: 0.1791,
    octaves: { count: 3, weights: [0.5, 0.25, 0.125] },
    lacunarity: 2,
    suppressRefraction: 1,
    smoothnessReduction: 0.35
  }
} as const satisfies WaterSurfaceAppearanceAssetV1;

export const legacySurfaceAppearanceFixture = {
  schemaVersion: WaterSurfaceAppearanceSchemaVersion.V1,
  id: "legacy-heightfield-surface",
  normal: { model: WaterSurfaceNormalModel.ProceduralSlope },
  depthTint: { model: WaterSurfaceDepthTintModel.BeerLambert },
  coastalAlpha: { model: WaterSurfaceCoastalAlphaModel.LegacyCoverage },
  contactFoam: { model: WaterSurfaceContactFoamModel.None }
} as const satisfies WaterSurfaceAppearanceAssetV1;
