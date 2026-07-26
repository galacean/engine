import {
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCoastalAlphaModel,
  WaterSurfaceContactFoamModel,
  WaterSurfaceDepthTintModel,
  WaterSurfaceNormalModel,
  WaterSurfaceNormalSampling,
  type WaterSurfaceAppearanceAssetV1
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterSurfaceAppearanceCompiler } from "../../compiler/surface/WaterSurfaceAppearanceCompiler";
import type { CompiledWaterSurfaceAppearanceV1 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import { HeightfieldWaterCompositionMode } from "../../runtime/heightfield/HeightfieldWaterRuntimeEnums";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../../runtime/optics/WaterOpticalProfile";
import type {
  GrasslandsCameraFixture,
  GrasslandsDirectLightFixture,
  GrasslandsMechanismRoi,
  GrasslandsSceneMaterialsFixture,
  GrasslandsTargetMaterialConfig,
  GrasslandsTerrainRecipe,
  GrasslandsWaterControllerPresentationConfig,
  GrasslandsWorldBounds
} from "./GrasslandsPcgTypes";

export const GRASSLANDS_PCG_DEFAULT_SEED = 20260724;
export const GRASSLANDS_PCG_FIXTURE_ID = "grasslands-water-pcg-fixture-v1";
export const GRASSLANDS_HEIGHTFIELD_DESCRIPTOR_ID = "grasslands-flat-water-heightfield-v1";
export const GRASSLANDS_SURFACE_APPEARANCE_ASSET_ID = "grasslands-stylized-water-surface-v1";
export const GRASSLANDS_NORMAL_ASSET_ID = "grasslands-water-normal-1024";
export const GRASSLANDS_NORMAL_CONTENT_HASH = "0d9bfdded6d8c46cff4afe145cf052ec31f079ae03d89b73599ccb7807c02332";
export const GRASSLANDS_SOURCE_WAVE_SPEED = 0.2;
export const GRASSLANDS_NORMAL_FLIP_GREEN = false;
/** M3 fixture/camera calibration; material-space target parameters remain frozen. */
export const GRASSLANDS_WORLD_SCALE = 0.5;

export const GRASSLANDS_WATER_GRID = Object.freeze({
  width: 160,
  height: 96,
  cellSize: 0.5 * GRASSLANDS_WORLD_SCALE,
  surfaceHeight: 0,
  authoredBedHeight: -3 * GRASSLANDS_WORLD_SCALE
});

export const GRASSLANDS_WATER_BOUNDS: GrasslandsWorldBounds = Object.freeze({
  minimum: Object.freeze([-40 * GRASSLANDS_WORLD_SCALE, 0, -24 * GRASSLANDS_WORLD_SCALE] as const),
  maximum: Object.freeze([40 * GRASSLANDS_WORLD_SCALE, 0, 24 * GRASSLANDS_WORLD_SCALE] as const)
});

export const GRASSLANDS_CAMERA_FIXTURE: GrasslandsCameraFixture = Object.freeze({
  mode: "fixed",
  // M3: lower and lengthen the Hero sightline so the foreground reads through
  // refraction while the distance receives a stronger grazing Fresnel response.
  position: Object.freeze([0, 3.5, 16] as const),
  target: Object.freeze([-1, -2.65, -10.5] as const),
  forward: Object.freeze([-0.03673412091541039, -0.2259148436297739, -0.9734542042583754] as const),
  fieldOfViewDegrees: 48,
  nearClip: 0.1 * GRASSLANDS_WORLD_SCALE,
  farClip: 200 * GRASSLANDS_WORLD_SCALE
});

export const GRASSLANDS_DIRECT_LIGHT_FIXTURE: GrasslandsDirectLightFixture = Object.freeze({
  color: Object.freeze([1, 1, 1] as const),
  intensity: 1.05,
  forward: Object.freeze([0.19169850264280183, -0.7869350219613372, 0.5865023062999986] as const)
});

export const GRASSLANDS_CAPTURE_VIEWPORT = Object.freeze([1340, 662] as const);

export const GRASSLANDS_MECHANISM_ROIS: readonly GrasslandsMechanismRoi[] = Object.freeze([
  Object.freeze({
    id: "detail-normal",
    x: 320,
    y: 270,
    width: 360,
    height: 170,
    purpose: "open-water dual-direction ripple frequency and direction"
  }),
  Object.freeze({
    id: "refraction",
    x: 690,
    y: 325,
    width: 300,
    height: 170,
    purpose: "submerged rock and bed displacement"
  }),
  Object.freeze({
    id: "depth-color",
    x: 330,
    y: 225,
    width: 430,
    height: 270,
    purpose: "shallow-to-deep cyan gradient"
  }),
  Object.freeze({
    id: "contact-foam-left",
    x: 55,
    y: 300,
    width: 330,
    height: 230,
    purpose: "left-bank and half-submerged rock contacts"
  }),
  Object.freeze({
    id: "contact-foam-right",
    x: 805,
    y: 370,
    width: 355,
    height: 200,
    purpose: "right-bank and foreground rock contacts"
  }),
  Object.freeze({
    id: "coastal-alpha",
    x: 805,
    y: 235,
    width: 355,
    height: 155,
    purpose: "right-bank shallow transparent transition"
  }),
  Object.freeze({
    id: "specular-response",
    x: 560,
    y: 210,
    width: 340,
    height: 185,
    purpose: "direct highlight and stable analytic reflection response"
  })
]);

export const GRASSLANDS_TERRAIN_RECIPE: GrasslandsTerrainRecipe = Object.freeze({
  model: "analytic-centerline-width",
  waterSurfaceHeight: GRASSLANDS_WATER_GRID.surfaceHeight,
  authoredBedHeight: GRASSLANDS_WATER_GRID.authoredBedHeight,
  bankNoise: "none",
  crossSections: Object.freeze([
    Object.freeze({
      centerXZ: Object.freeze([-3 * GRASSLANDS_WORLD_SCALE, -24 * GRASSLANDS_WORLD_SCALE] as const),
      halfWidth: 5.5 * GRASSLANDS_WORLD_SCALE
    }),
    Object.freeze({
      centerXZ: Object.freeze([-5 * GRASSLANDS_WORLD_SCALE, -16 * GRASSLANDS_WORLD_SCALE] as const),
      halfWidth: 6 * GRASSLANDS_WORLD_SCALE
    }),
    Object.freeze({
      centerXZ: Object.freeze([-4 * GRASSLANDS_WORLD_SCALE, -8 * GRASSLANDS_WORLD_SCALE] as const),
      halfWidth: 8 * GRASSLANDS_WORLD_SCALE
    }),
    Object.freeze({
      centerXZ: Object.freeze([1 * GRASSLANDS_WORLD_SCALE, 0] as const),
      halfWidth: 12 * GRASSLANDS_WORLD_SCALE
    }),
    Object.freeze({
      centerXZ: Object.freeze([3 * GRASSLANDS_WORLD_SCALE, 12 * GRASSLANDS_WORLD_SCALE] as const),
      halfWidth: 17 * GRASSLANDS_WORLD_SCALE
    }),
    Object.freeze({
      centerXZ: Object.freeze([0, 24 * GRASSLANDS_WORLD_SCALE] as const),
      halfWidth: 22 * GRASSLANDS_WORLD_SCALE
    })
  ])
});

export const GRASSLANDS_SCENE_MATERIALS: GrasslandsSceneMaterialsFixture = Object.freeze({
  bed: Object.freeze({
    baseColor: Object.freeze([0.32, 0.27, 0.16, 1] as const),
    specularColor: Object.freeze([0.025, 0.035, 0.02, 1] as const),
    emissiveColor: Object.freeze([0.008, 0.012, 0.006, 1] as const),
    shininess: 6
  }),
  bank: Object.freeze({
    baseColor: Object.freeze([0.22, 0.31, 0.16, 1] as const),
    specularColor: Object.freeze([0.025, 0.035, 0.02, 1] as const),
    emissiveColor: Object.freeze([0.008, 0.012, 0.006, 1] as const),
    shininess: 6
  }),
  rock: Object.freeze({
    baseColor: Object.freeze([0.25, 0.28, 0.25, 1] as const),
    specularColor: Object.freeze([0.12, 0.14, 0.13, 1] as const),
    emissiveColor: Object.freeze([0.009, 0.01, 0.009, 1] as const),
    shininess: 18
  })
});

/**
 * Heightfield V1 still requires a legacy material block. This neutral fallback is
 * not the strict Grasslands appearance; GS-DEMO-04 owns the target Appearance.
 */
export const GRASSLANDS_HEIGHTFIELD_PLACEHOLDER_MATERIAL = Object.freeze({
  shallowColor: Object.freeze([0.08, 0.3, 0.36, 0.7] as const),
  deepColor: Object.freeze([0.02, 0.08, 0.12, 0.92] as const),
  opacity: 0.8,
  shoreFoamWidth: 0,
  microNormalStrength: 0,
  waveStrength: 0
});

export const GRASSLANDS_SURFACE_APPEARANCE_ASSET: WaterSurfaceAppearanceAssetV1 = Object.freeze({
  schemaVersion: WaterSurfaceAppearanceSchemaVersion.V1,
  id: GRASSLANDS_SURFACE_APPEARANCE_ASSET_ID,
  normal: Object.freeze({
    model: WaterSurfaceNormalModel.ExternalTangentNormal,
    textureAssetId: GRASSLANDS_NORMAL_ASSET_ID,
    textureContentHash: GRASSLANDS_NORMAL_CONTENT_HASH,
    sampling: WaterSurfaceNormalSampling.WorldXzMirroredDual,
    tiling: 0.05,
    scrollUvPerSecond: GRASSLANDS_SOURCE_WAVE_SPEED / 10,
    strength: 0.2,
    flipGreen: GRASSLANDS_NORMAL_FLIP_GREEN
  }),
  depthTint: Object.freeze({
    model: WaterSurfaceDepthTintModel.SceneDepthPower,
    color: Object.freeze([0.21710525, 0.45953944, 0.55, 1] as const),
    distance: 10,
    exponent: 0.5
  }),
  coastalAlpha: Object.freeze({
    model: WaterSurfaceCoastalAlphaModel.SceneDepth,
    distance: 0.5
  }),
  contactFoam: Object.freeze({
    model: WaterSurfaceContactFoamModel.SceneDepthVoronoi,
    worldScale: 2.5,
    timeRate: GRASSLANDS_SOURCE_WAVE_SPEED * 5,
    opacity: 0.453,
    contactDistance: 0.1791,
    octaves: Object.freeze({
      count: 3,
      weights: Object.freeze([0.5, 0.25, 0.125] as const)
    }),
    lacunarity: 2,
    // A full foam mask removes the corresponding refraction contribution.
    suppressRefraction: 1,
    // Base roughness is zero, so this produces roughness=foam and smoothness=1-foam.
    smoothnessReduction: 1
  })
});

function compileGrasslandsSurfaceAppearance(): CompiledWaterSurfaceAppearanceV1 {
  const result = WaterSurfaceAppearanceCompiler.compile(GRASSLANDS_SURFACE_APPEARANCE_ASSET);
  if (!result.valid || !result.data) {
    const diagnostic = result.diagnostics.map(({ path, message }) => `${path}: ${message}`).join("; ");
    throw new Error(`Grasslands Surface Appearance failed validation: ${diagnostic}`);
  }
  return result.data;
}

export const GRASSLANDS_COMPILED_SURFACE_APPEARANCE = compileGrasslandsSurfaceAppearance();

export const GRASSLANDS_WATER_OPTICAL_PROFILE: WaterOpticalProfile = Object.freeze({
  ...DEFAULT_WATER_OPTICAL_PROFILE,
  refractionStrength: 0.1,
  roughness: 0,
  reflectionIntensity: 1
});

export const GRASSLANDS_WATER_CONTROLLER_PRESENTATION: GrasslandsWaterControllerPresentationConfig = Object.freeze({
  compositionMode: HeightfieldWaterCompositionMode.PrecomposedReplace,
  depthWriteEnabled: true
});

export const GRASSLANDS_TARGET_MATERIAL_CONFIG: GrasslandsTargetMaterialConfig = Object.freeze({
  sourceWaveSpeed: GRASSLANDS_SOURCE_WAVE_SPEED,
  surfaceAppearance: GRASSLANDS_SURFACE_APPEARANCE_ASSET,
  opticalProfile: GRASSLANDS_WATER_OPTICAL_PROFILE,
  controller: GRASSLANDS_WATER_CONTROLLER_PRESENTATION
});

export const GRASSLANDS_PCG_PRESET = Object.freeze({
  caseId: "showcase-grasslands-stylized-water" as const,
  runtime: "grasslands" as const,
  preset: "hero-grasslands" as const,
  waterBodyType: "heightfield" as const,
  seed: GRASSLANDS_PCG_DEFAULT_SEED,
  quality: WaterQualityTier.High,
  grid: GRASSLANDS_WATER_GRID,
  waterBounds: GRASSLANDS_WATER_BOUNDS,
  camera: GRASSLANDS_CAMERA_FIXTURE,
  directLight: GRASSLANDS_DIRECT_LIGHT_FIXTURE,
  captureViewport: GRASSLANDS_CAPTURE_VIEWPORT,
  mechanismRois: GRASSLANDS_MECHANISM_ROIS,
  terrain: GRASSLANDS_TERRAIN_RECIPE,
  sceneMaterials: GRASSLANDS_SCENE_MATERIALS,
  targetMaterialConfig: GRASSLANDS_TARGET_MATERIAL_CONFIG
});
