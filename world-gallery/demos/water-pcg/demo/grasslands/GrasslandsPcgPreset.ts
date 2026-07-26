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
  GrasslandsCandidateValidationRoi,
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
  width: 143,
  height: 128,
  cellSize: 1.125 * GRASSLANDS_WORLD_SCALE,
  surfaceHeight: 0,
  authoredBedHeight: -3 * GRASSLANDS_WORLD_SCALE
});

export const GRASSLANDS_WATER_BOUNDS: GrasslandsWorldBounds = Object.freeze({
  minimum: Object.freeze([-80.4375 * GRASSLANDS_WORLD_SCALE, 0, -72 * GRASSLANDS_WORLD_SCALE] as const),
  maximum: Object.freeze([80.4375 * GRASSLANDS_WORLD_SCALE, 0, 72 * GRASSLANDS_WORLD_SCALE] as const)
});

export const GRASSLANDS_CAMERA_FIXTURE: GrasslandsCameraFixture = Object.freeze({
  mode: "fixed",
  // M3 large-landscape calibration: the low, long sightline keeps the near
  // shoal readable while compressing the bay, channel and far river into one
  // continuous cinematic view.
  position: Object.freeze([4, 4.5, 34] as const),
  target: Object.freeze([-2, -10, -20] as const),
  forward: Object.freeze([-0.10669723123906885, -0.25785164216108303, -0.9602750811516196] as const),
  fieldOfViewDegrees: 50,
  nearClip: 0.1 * GRASSLANDS_WORLD_SCALE,
  farClip: 320 * GRASSLANDS_WORLD_SCALE
});

export const GRASSLANDS_SHARED_SHOWCASE_CAPTURE_POSES = Object.freeze({
  hero: Object.freeze({
    position: GRASSLANDS_CAMERA_FIXTURE.position,
    target: GRASSLANDS_CAMERA_FIXTURE.target
  }),
  interaction: Object.freeze({
    position: Object.freeze([0, 2.4, 29] as const),
    target: Object.freeze([0, -0.6, 11] as const)
  }),
  detail: Object.freeze({
    position: Object.freeze([-11, 2.3, 13] as const),
    target: Object.freeze([-4, -1.2, -2] as const)
  })
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

/**
 * Candidate-only M3 ROIs for the expanded Hero composition. These never replace
 * the frozen Reference Parity target/mask/ROI fixture.
 */
export const GRASSLANDS_CANDIDATE_VALIDATION_ROIS: readonly GrasslandsCandidateValidationRoi[] = Object.freeze([
  Object.freeze({
    id: "candidate-left-bank",
    x: 0,
    y: 200,
    width: 150,
    height: 80,
    purpose: "static left bank and curved Sand-to-GrassMud boundary protection"
  }),
  Object.freeze({
    id: "candidate-right-bank",
    x: 1190,
    y: 200,
    width: 150,
    height: 80,
    purpose: "static right bank and asymmetric cove protection"
  }),
  Object.freeze({
    id: "candidate-open-water",
    x: 580,
    y: 450,
    width: 180,
    height: 120,
    purpose: "near open-water temporal normal and highlight motion"
  }),
  Object.freeze({
    id: "candidate-static-large-rock-left",
    x: 274,
    y: 215,
    width: 7,
    height: 5,
    purpose: "interior of the left-bank large scenic rock for temporal protection"
  }),
  Object.freeze({
    id: "candidate-static-large-rock-right",
    x: 1120,
    y: 331,
    width: 14,
    height: 7,
    purpose: "interior of the right-bank anchor rock for temporal protection"
  }),
  Object.freeze({
    id: "candidate-static-small-rock",
    x: 944,
    y: 200,
    width: 10,
    height: 5,
    purpose: "shore small-rock interior for temporal protection and visibility"
  }),
  Object.freeze({
    id: "candidate-anchor-left",
    x: 240,
    y: 275,
    width: 125,
    height: 100,
    purpose: "left foreground Scene Depth contact and ContactFoam response"
  }),
  Object.freeze({
    id: "candidate-anchor-right",
    x: 1075,
    y: 285,
    width: 120,
    height: 100,
    purpose: "right-bank Scene Depth contact and ContactFoam response"
  }),
  Object.freeze({
    id: "candidate-anchor-channel",
    x: 685,
    y: 170,
    width: 150,
    height: 90,
    purpose: "far channel Scene Depth contact and ContactFoam response"
  }),
  Object.freeze({
    id: "candidate-far-river",
    x: 570,
    y: 170,
    width: 280,
    height: 120,
    purpose: "winding far river visibility and one-body connectivity"
  }),
  Object.freeze({
    id: "candidate-narrow-channel",
    x: 650,
    y: 175,
    width: 210,
    height: 95,
    purpose: "narrow channel visibility between far river and bay"
  }),
  Object.freeze({
    id: "candidate-mid-bay",
    x: 250,
    y: 220,
    width: 900,
    height: 230,
    purpose: "asymmetric middle bay and depth-color transition"
  }),
  Object.freeze({
    id: "candidate-near-shoal",
    x: 0,
    y: 380,
    width: 1340,
    height: 282,
    purpose: "near shoal bed, shallow refraction and underwater rock visibility"
  }),
  Object.freeze({
    id: "candidate-near-optics",
    x: 360,
    y: 340,
    width: 360,
    height: 170,
    purpose: "near refraction and high-frequency normal response"
  }),
  Object.freeze({
    id: "candidate-mid-optics",
    x: 300,
    y: 250,
    width: 740,
    height: 180,
    purpose: "middle depth color and contact hierarchy"
  }),
  Object.freeze({
    id: "candidate-far-optics",
    x: 590,
    y: 175,
    width: 250,
    height: 100,
    purpose: "far grazing Fresnel, reflection and direct-specular response"
  })
]);

export const GRASSLANDS_TERRAIN_RECIPE: GrasslandsTerrainRecipe = Object.freeze({
  model: "analytic-centerline-width",
  interpolation: "catmull-rom",
  waterSurfaceHeight: GRASSLANDS_WATER_GRID.surfaceHeight,
  authoredBedHeight: GRASSLANDS_WATER_GRID.authoredBedHeight,
  minimumTerrainBedHeight: -3.5,
  bankNoise: "none",
  sampling: Object.freeze({
    longitudinalSegments: 192,
    grassLateralSegments: 24,
    sandLateralSegments: 6,
    bedLateralSegments: 64,
    sandBandWidth: 1.2
  }),
  crossSections: Object.freeze([
    Object.freeze({
      centerXZ: Object.freeze([-6, -36] as const),
      leftHalfWidth: 5,
      rightHalfWidth: 7,
      bedDepth: 2.8
    }),
    Object.freeze({
      centerXZ: Object.freeze([-8, -30] as const),
      leftHalfWidth: 6,
      rightHalfWidth: 8,
      bedDepth: 3.2
    }),
    Object.freeze({
      centerXZ: Object.freeze([-5, -24] as const),
      leftHalfWidth: 5.5,
      rightHalfWidth: 6.5,
      bedDepth: 2.6
    }),
    Object.freeze({
      centerXZ: Object.freeze([0, -18] as const),
      leftHalfWidth: 4.2,
      rightHalfWidth: 4.8,
      bedDepth: 2
    }),
    Object.freeze({
      centerXZ: Object.freeze([4, -12] as const),
      leftHalfWidth: 7,
      rightHalfWidth: 10,
      bedDepth: 2.6
    }),
    Object.freeze({
      centerXZ: Object.freeze([2, -6] as const),
      leftHalfWidth: 13,
      rightHalfWidth: 16,
      bedDepth: 3.2
    }),
    Object.freeze({
      centerXZ: Object.freeze([-3, 0] as const),
      leftHalfWidth: 15,
      rightHalfWidth: 12,
      bedDepth: 2.8
    }),
    Object.freeze({
      centerXZ: Object.freeze([-6, 6] as const),
      leftHalfWidth: 12,
      rightHalfWidth: 10,
      bedDepth: 2.2
    }),
    Object.freeze({
      centerXZ: Object.freeze([-3, 12] as const),
      leftHalfWidth: 10,
      rightHalfWidth: 13,
      bedDepth: 1.6
    }),
    Object.freeze({
      centerXZ: Object.freeze([2, 18] as const),
      leftHalfWidth: 9,
      rightHalfWidth: 11,
      bedDepth: 0.9
    }),
    Object.freeze({
      centerXZ: Object.freeze([4, 24] as const),
      leftHalfWidth: 14,
      rightHalfWidth: 16,
      bedDepth: 0.65
    }),
    Object.freeze({
      centerXZ: Object.freeze([0, 30] as const),
      leftHalfWidth: 16,
      rightHalfWidth: 14,
      bedDepth: 0.5
    }),
    Object.freeze({
      centerXZ: Object.freeze([-4, 36] as const),
      leftHalfWidth: 12,
      rightHalfWidth: 18,
      bedDepth: 0.75
    })
  ]),
  landscapeRegions: Object.freeze([
    Object.freeze({
      id: "far-river",
      zRange: Object.freeze([-36, -24] as const),
      focusXZ: Object.freeze([-6, -30] as const),
      purpose: "winding distant main river with grazing-angle Fresnel and reflection"
    }),
    Object.freeze({
      id: "narrow-channel",
      zRange: Object.freeze([-22, -14] as const),
      focusXZ: Object.freeze([-1, -18] as const),
      purpose: "compressed channel separating the far river from the middle bay"
    }),
    Object.freeze({
      id: "mid-bay",
      zRange: Object.freeze([-12, 8] as const),
      focusXZ: Object.freeze([-1, -2] as const),
      purpose: "asymmetric pond-like bay carrying the strongest depth-color transition"
    }),
    Object.freeze({
      id: "near-shoal",
      zRange: Object.freeze([18, 36] as const),
      focusXZ: Object.freeze([1, 28] as const),
      purpose: "shallow foreground shoal exposing bed texture, refraction and underwater rocks"
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
  candidateValidationRois: GRASSLANDS_CANDIDATE_VALIDATION_ROIS,
  terrain: GRASSLANDS_TERRAIN_RECIPE,
  sceneMaterials: GRASSLANDS_SCENE_MATERIALS,
  targetMaterialConfig: GRASSLANDS_TARGET_MATERIAL_CONFIG
});
