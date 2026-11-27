/** Offline reconstruction sample; excluded from production asset loading and bundling. */
import {
  generateProceduralTreeGeometry,
  type ProceduralTreeDistributionTuning,
  type ProceduralTreeFoliageGeometryTuning,
  type ProceduralTreeGeometry,
  type ProceduralTreeSource,
  type ProceduralTreeStructureParameters,
  type ProceduralTreeTriangleBudgetTuning
} from "../ProceduralTreeGenerator";
import type { TreeLeafCountTuning } from "../ProceduralTreeLeafCount";
import proceduralRecipeJson from "../generated/procedural-trees/measured-white-birch/procedural-recipe.json?raw";

interface ProceduralTreeRecipeData {
  readonly schema: "galacean/procedural-tree-recipe-v4";
  readonly assetId: string;
  readonly profile: ProceduralTreeSource["proceduralProfile"];
  readonly size: number;
  readonly structureParameters: ProceduralTreeStructureParameters;
  readonly distributionTuning: ProceduralTreeDistributionTuning;
  readonly leafCountTuning: TreeLeafCountTuning;
  readonly foliageTuning: ProceduralTreeFoliageGeometryTuning;
  readonly triangleBudget: ProceduralTreeTriangleBudgetTuning;
}

export const PROCEDURAL_TREE_RECIPE = Object.freeze(JSON.parse(proceduralRecipeJson) as ProceduralTreeRecipeData);
if (
  PROCEDURAL_TREE_RECIPE.schema !== "galacean/procedural-tree-recipe-v4" ||
  PROCEDURAL_TREE_RECIPE.assetId !== "measured-white-birch"
) {
  throw new Error("Measured white-birch recipe is invalid");
}

export const PROCEDURAL_TREE_SOURCE: ProceduralTreeSource = Object.freeze({
  id: "measured-white-birch",
  label: "Measured White Birch",
  size: PROCEDURAL_TREE_RECIPE.size,
  proceduralProfile: PROCEDURAL_TREE_RECIPE.profile,
  structureParameters: PROCEDURAL_TREE_RECIPE.structureParameters
});

export const PROCEDURAL_LEAF_COUNT_TUNING: TreeLeafCountTuning = Object.freeze({
  ...PROCEDURAL_TREE_RECIPE.leafCountTuning
});

/**
 * Inverse-fit Sapling controls derived from measured branch centerlines and leaf-card distribution.
 * The data lives in a recipe so the generator remains species-agnostic.
 */
export const PROCEDURAL_BRANCH_DISTRIBUTION_TUNING: ProceduralTreeDistributionTuning = Object.freeze({
  ...PROCEDURAL_TREE_RECIPE.distributionTuning
});

export const PROCEDURAL_FOLIAGE_GEOMETRY_TUNING: ProceduralTreeFoliageGeometryTuning = Object.freeze({
  ...PROCEDURAL_TREE_RECIPE.foliageTuning
});

export const PROCEDURAL_LOD_TRIANGLE_BUDGET: ProceduralTreeTriangleBudgetTuning = Object.freeze({
  ...PROCEDURAL_TREE_RECIPE.triangleBudget
});

export const WHITE_BIRCH_MEASUREMENTS = Object.freeze({
  lods: [
    {
      branches: [1, 28, 27],
      leafCards: 1377,
      trunkTriangles: 1766,
      leafTriangles: 2754,
      triangles: 4520,
      trunkBoundsSize: [4.3145077229, 13.4467512369, 4.5561821461],
      crownBoundsSize: [6.0586941242, 10.6970603466, 6.1673688889]
    },
    {
      branches: [1, 21, 10],
      leafCards: 918,
      trunkTriangles: 924,
      leafTriangles: 1836,
      triangles: 2760,
      trunkBoundsSize: [4.3145077229, 13.1238169, 4.5527234],
      crownBoundsSize: [6.1215312, 10.7184575, 6.2317946]
    },
    {
      branches: [1, 11, 2],
      leafCards: 459,
      trunkTriangles: 354,
      leafTriangles: 918,
      triangles: 1272,
      trunkBoundsSize: [4.2677178, 13.1245007, 4.5527234],
      crownBoundsSize: [5.789561, 10.717026, 5.931133]
    }
  ],
  primaryBranches: {
    rootHeightQuantiles: [2.5581, 4.4172, 6.2548, 8.6664, 10.5985, 11.6261, 12.4327],
    endpointLengthQuantiles: [1.0488, 1.1262, 2.3071, 2.8354, 2.9883],
    upAngleDegreesQuantiles: [28.11, 29.18, 40.91, 46.24, 47.73]
  },
  twigs: {
    rootHeightQuantiles: [3.437, 4.227, 5.357, 7.279, 7.555, 9.218, 9.747],
    endpointLengthQuantiles: [1.1332, 1.1843, 1.4039, 1.4573, 1.4604],
    upAngleDegreesQuantiles: [30.58, 31.53, 33.86, 36.33, 74.13]
  },
  leaves: {
    centerHeightQuantiles: [5.4689446, 7.455246, 9.3534908, 12.0132074, 12.7148407],
    centerRadiusQuantiles: [0.8427404, 1.2801025, 1.7634677, 2.2179169, 2.4718112],
    heightBins: [177, 237, 300, 255, 408],
    radiusBins: [72, 183, 387, 432, 303],
    xzQuadrants: [306, 348, 378, 345],
    medianCardSize: [0.668212, 0.668212]
  },
  lodGroup: {
    referencePoint: [0.012057304, 6.518559, -0.11554384],
    size: 14.121669,
    screenRelativeTransitionHeights: [0.7529094, 0.3, 0.047589432],
    fadeMode: "cross-fade"
  }
});

/** Source material measurements retained for offline reconstruction validation. */
export const WHITE_BIRCH_MATERIAL_PROFILE = Object.freeze({
  trunk: {
    shader: "Terrain/Surface",
    baseTexture: "measured-white-birch-bark-albedo.png",
    normalTexture: "measured-white-birch-bark-normal.ktx2",
    baseColor: [0.9, 0.9, 0.9, 0],
    barkColor: [0.877, 0.877, 0.877, 0],
    sourceTiling: [2.85, 1.5] as const,
    /** Effective source repeats per canonical metre, measured after _SurfaceAlbedo_ST. */
    uvTilesPerMeter: [1.879222, 0.667757] as const,
    materialTiling: 1,
    metallic: 0,
    smoothness: 0,
    normalScale: 1
  },
  leaves: {
    shader: "Terrain/Vegetation",
    baseTexture: "measured-white-birch-leaves.ktx2",
    baseColor: [0.11446146, 0.496, 0.05341538, 0],
    secondColor: [0.5568627, 1, 0.10196078, 0],
    secondColorLevel: -7.5,
    /** Effective measured two-color gradient. */
    secondColorGradient: -0.12,
    alphaCutoff: 0.35,
    doubleSided: true,
    metallic: 0,
    smoothness: 0.1,
    translucencyColor: [1, 1, 1, 0],
    translucencyIntensity: 12,
    translucencyBacklightThreshold: 0.2,
    translucencyNormalWrap: 1,
    translucencyEnergyScale: 0.5,
    translucencyShadowStrength: 1,
    windForce: 0.142,
    windSpeed: 0.508,
    windWavesScale: 0.346,
    macros: [
      "MATERIAL_ENABLE_SECOND_COLOR",
      "MATERIAL_ENABLE_TRANSLUCENCY",
      "MATERIAL_ENABLE_WIND",
      "MATERIAL_HAS_BASETEXTURE",
      "MATERIAL_SECOND_COLOR_LINEAR_OBJECT_GRADIENT",
      "MATERIAL_VEGETATION_CLIMATE_LEAF"
    ]
  }
});

export function generateMeasuredWhiteBirchGeometry(): ProceduralTreeGeometry {
  return generateProceduralTreeGeometry(
    PROCEDURAL_TREE_SOURCE,
    PROCEDURAL_LEAF_COUNT_TUNING,
    PROCEDURAL_BRANCH_DISTRIBUTION_TUNING,
    PROCEDURAL_FOLIAGE_GEOMETRY_TUNING,
    PROCEDURAL_LOD_TRIANGLE_BUDGET
  );
}
