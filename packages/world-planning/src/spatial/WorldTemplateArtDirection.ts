import type { TemplateNode, TemplateAssetSlot } from "./WorldTemplateGeometry";
import type { SpatialCompositionParameters } from "./SpatialCompositionParameters";

interface WorldTemplatePalette {
  grass: [string, string];
  ground: string;
  road?: string;
  foliage: string;
  /** Leaf colours keyed by native species identity, independent of catalog order. */
  treeFoliage?: Readonly<Record<string, string>>;
  /** Per-part HDR colours for native vegetation layers; species accents retain every model variant. */
  plantPalette?: {
    layers: readonly string[];
    parts: Readonly<Record<string, { color: string; intensity: number }>>;
    species?: Readonly<Record<string, Readonly<Record<string, { color: string; intensity: number }>>>>;
    /** Exact native material slots override the part palette, including slots outside its layers. */
    slots?: Readonly<Record<string, Readonly<Record<string, { color: string; intensity: number }>>>>;
  };
  bark: string;
  flowers: string;
  stone: string;
}

/** Authored scene measurements from the fifteen supplied reference images.
 * These are template inputs, not geometry guessed from a Seed or renderer output.
 * Each model entry defines an asset envelope, with a supplied model when available.
 * Camera fitting uses only the focus entries. */
export type WorldTemplateArtDirection = (WorldTemplatePalette | { grass?: undefined }) & {
  reference: string;
  grassGroundFusion?: boolean;
  initialPlanning?: {
    landMode?: import("../semantic-study/IslandPlanModel").IslandPlanParameters["landMode"];
    relief?: {
      reliefNearAmplitudeM: number;
      reliefAmplitudeM: number;
      reliefFarAmplitudeM: number;
      reliefScaleM: number;
    };
    roadsEnabled?: boolean;
    farmingEnabled?: boolean;
    poiMemberMax?: number;
    population?: import("./PlanningPopulationParameters").PlanningPopulationOptions;
  };
  focus: string[];
  /** Viewport fraction available to the focus envelope. Wide shots can frame into an oversized envelope. */
  frameFraction: number;
  /** Reserve each subject in a solved POI and publish a clear starting view. */
  plannedSubjects?: boolean;
  /** A continuous world framed from its map centre instead of a searched spawn. */
  centeredStart?: boolean;
  azimuthDegrees: number;
  /** Composition aim relative to the focus envelope; a side subject stays at the side. */
  lookAtOffset?: [number, number, number];
  models: (TemplateNode | TemplateAssetSlot)[];
  /** Infrastructure may be generated around a separately authored set of model poses. */
  modelLayout?: "authored" | "generated";
  spores?: {
    count: number;
    center: [number, number, number];
    extent: [number, number, number];
    radiusM: number;
    /** Minimum glow diameter as a fraction of the viewport height. */
    minScreenFraction: number;
    color: string;
    intensity: number;
    driftM: number;
    periodSeconds: number;
  };
  /** Textured native billboard particles; motion and scale use metres and seconds. */
  petals?: {
    textureUrl: string;
    count: number;
    center: [number, number, number];
    extent: [number, number, number];
    sizeM: [number, number];
    lifetimeSeconds: number;
    fallSpeedMps: [number, number];
    windMps: [number, number, number];
    flutterMps: number;
    flutterWavelengthM: number;
    spinDegreesPerSecond: [number, number];
    /** Submission order within the transparent queue. */
    renderPriority: number;
    /** Foreground petals may opt out of scene occlusion while retaining perspective motion. */
    depthTest: boolean;
    color: string;
    intensity: number;
    emission?: { color: string; intensity: number };
  };
  /** Scalar authoring only; roads, water, relief and populations are derived. */
  generation?: Partial<SpatialCompositionParameters>;
  lighting: Record<string, number | boolean>;
  postProcess: Record<string, number | boolean>;
  landscape?: Record<string, number>;
  /** Initial density and distribution inputs; subsequent authored controls retain precedence. */
  initialLandscape?: Record<string, number>;
  initialFlowers?: Record<string, number>;
  flowerCoverage?: number;
  weather?: {
    cloudCoverage?: number;
    cloudBaseAltitudeM?: number;
    cloudFeatureSize?: number;
    rainRate?: number;
    snowRate?: number;
    temperatureCelsius?: number;
    relativeHumidity?: number;
  };
  /** Real native water bodies. Depth/level are independent from their colour. */
  water?: { id: string; x: number; z: number; radius: number; depth: number; color: [number, number, number] }[];
  support?: "land" | "submerged";
  /** Authored vegetation areas form the reference's core foreground/background. */
  plantings?: { id: string; kind: "tree" | "shrub"; x: number; z: number; radius: number; densityScale: number }[];
  /** Relative core landforms. Heights and positions remain fixed with the subject. */
  terrain?: {
    id: string;
    x: number;
    z: number;
    kind: "ridge" | "plateau" | "valley" | "basin";
    length: number;
    width: number;
    height: number;
    heading: number;
  }[];
};
const model = (
  id: string,
  position: [number, number, number],
  scale: [number, number, number],
  grounded = true,
  yaw = 0
): TemplateNode => ({ id, position, scale, grounded, rotation: [0, yaw, 0] });
const lighting = (
  timeHours: number,
  sunIntensity: number,
  ambientIntensity: number,
  skyExposure: number,
  fogDensity: number,
  shadowStrength = 0.7
) => ({
  timeHours,
  sunIntensity,
  ambientIntensity,
  iblIntensity: ambientIntensity,
  skyExposure,
  fogDensity,
  shadowStrength,
  direct: true,
  environment: true,
  shadows: true,
  fog: true
});
const post = (contrast: number, saturation = 0, temperature = 0) => ({
  enabled: true,
  tonemapping: true,
  postExposure: 0,
  contrast,
  saturation,
  temperature,
  bloom: true,
  bloomThreshold: 1,
  bloomIntensity: 0.25,
  bloomScatter: 0.6
});
type Rgb = readonly [number, number, number];
/** Independent atmosphere inputs, measured against each reference's sky rather
 * than copied from its foliage/ground palette. Neutral wavelength controls
 * remove the original profile's interpolated green sunset. Night scattering is
 * a separate native Moon channel: the daytime gradient does not tint it. */
const atmosphere = (zenith: Rgb, horizon: Rgb, moon: Rgb = [1, 1, 1], moonEnergy = 0) => ({
  skyTintR: 0.21404114,
  skyTintG: 0.21404114,
  skyTintB: 0.21404114,
  customSkyTintStrength: 1,
  customSkyZenithR: zenith[0],
  customSkyZenithG: zenith[1],
  customSkyZenithB: zenith[2],
  customSkyHorizonR: horizon[0],
  customSkyHorizonG: horizon[1],
  customSkyHorizonB: horizon[2],
  groundTintR: 0.18,
  groundTintG: 0.18,
  groundTintB: 0.2,
  moonColorR: moon[0],
  moonColorG: moon[1],
  moonColorB: moon[2],
  moonLightIntensity: moonEnergy,
  moonAtmosphereIntensityScale: 4,
  moonDiskIntensity: 1,
  starIntensity: moonEnergy > 0 ? 0.6 : 0,
  twilightIntensity: 0.25,
  airglowIntensity: 0.15,
  fogRadianceIntensity: 1,
  fogTintR: 1,
  fogTintG: 1,
  fogTintB: 1
});
const ridge = (id: string, x: number, z: number, length: number, width: number, height: number, heading = 90) => ({
  id,
  x,
  z,
  length,
  width,
  height,
  heading,
  kind: "ridge" as const
});
const plateau = (id: string, x: number, z: number, length: number, width: number, height: number) => ({
  id,
  x,
  z,
  length,
  width,
  height,
  heading: 0,
  kind: "plateau" as const
});

const forestMushroom = (id: string, x: number, z: number, height: number, yaw = 0): TemplateNode => ({
  ...model(id, [x, 0, z], [height, height, height], true, yaw),
  footprint: [height * 0.22, height * 0.22],
  assetUrl: new URL("../assets/forest-luminous-mushroom.glb", import.meta.url).href,
  assetMaterials: {
    // A forest-only material variant. The red source GLB and its local emission mask stay intact.
    Mushroom_Tree: {
      emission: { color: "#ffffff", intensity: 15 },
      translucent: {
        shade: "#78ead4",
        highlight: "#adfff2",
        textureExposure: 4,
        transmission: 0.68,
        roughness: 0.48,
        clearCoat: 0.45,
        clearCoatRoughness: 0.2
      }
    }
  }
});
// Measurements after the supplied GLB's node transforms, in source metres.
// The cut rim is slanted; its highest point, rather than the mesh minimum, is the planting plane.
const forestOakRoot = {
  topY: 0.2235571464766295,
  plantingY: 0.007137361742719506,
  halfWidth: 0.034349252409877185,
  halfDepth: 0.03463059992993678
};
const forestOak = (id: string, x: number, z: number, height: number, yaw: number): TemplateNode => ({
  ...model(id, [x, 0, z], [height, height, height * 0.65], true, yaw),
  footprint: [height * 0.065, height * 0.065],
  assetGroundY: forestOakRoot.plantingY,
  groundingFootprint: [
    (2 * forestOakRoot.halfWidth * height) / (forestOakRoot.topY - forestOakRoot.plantingY),
    (2 * forestOakRoot.halfDepth * height) / (forestOakRoot.topY - forestOakRoot.plantingY)
  ],
  assetUrl: new URL("../assets/forest-giant-oak.glb", import.meta.url).href,
  assetLeafMaterials: ["Flower_Clusters_512", "Flowers_512"],
  assetLeafColor: "#74a45b"
});
const forestFern = (id: string, x: number, z: number, height: number, yaw: number): TemplateNode => ({
  ...model(id, [x, 0, z], [height * 4, height, height * 4], true, yaw),
  footprint: [height * 0.25, height * 0.25],
  assetUrl: new URL("../assets/forest-fern.glb", import.meta.url).href,
  assetLeafMaterials: ["MI_Ferns"],
  assetLeafColor: "#9cbd4c"
});

const sakuraBirchMaterials = {
  "appearance-58da25ba7b394497": { color: "#825636", intensity: 1 },
  "appearance-a8b3441a505dd0f2": { color: "#a06f49", intensity: 1 },
  "appearance-e832df91cc4eb1a2": { color: "#ff6681", intensity: 2 }
};

export const WORLD_TEMPLATE_ART: Readonly<Record<string, WorldTemplateArtDirection>> = {
  "sakura-pearl": {
    generation: {
      enabled: true,
      widthM: 440,
      frontDepthM: 270,
      backDepthM: 180,
      roadWidthM: 7,
      roadBendM: 14,
      roadWavelengthM: 210,
      roadEndWidthRatio: 0.5,
      destinationId: "",
      forecourtDepthM: 14,
      streamWidthM: 14,
      streamDepthM: 0.9,
      bankWidthM: 12,
      leftReliefM: 104,
      rightReliefM: 108,
      reliefSurface: "rocks",
      reliefBandWidthM: 128,
      reliefFrontDepthM: 54,
      bankReliefM: 26,
      rearReliefM: 72,
      rearReliefDepthM: 64,
      reliefInnerHeightRatio: 0.45,
      reliefFrontHeightRatio: 0.65,
      reliefTreeDensity: 0.7,
      terraceStepHeightM: 20,
      terraceTreadM: 32,
      cliffSharpness: 1,
      terrainRoughness: 0.22,
      waterfallWidthM: 8,
      treeSpacingM: 19,
      treeBandWidthM: 74,
      treeHorizontalScale: 1.6,
      treeSpeciesGroup: "birch-tree",
      subjectTerraceHeightM: 12,
      subjectTerraceRadiusM: 51,
      rockSpacingM: 16,
      rockWidthM: 6,
      rockDepthM: 5,
      rockHeightM: 3.5,
      replacePopulation: true
    },
    reference: "SeedWorld-01-sakura-pearl.png",
    focus: ["pearl-cherry-tree"],
    frameFraction: 1.48,
    azimuthDegrees: 0,
    lookAtOffset: [0, -13, 0],
    petals: {
      textureUrl: new URL("../assets/sakura-petal.png", import.meta.url).href,
      count: 280,
      center: [0, 18, -95],
      extent: [96, 28, 210],
      sizeM: [0.45, 1.1],
      lifetimeSeconds: 22,
      fallSpeedMps: [0.3, 0.65],
      windMps: [0.7, 0, 0.25],
      flutterMps: 0.2,
      flutterWavelengthM: 3,
      spinDegreesPerSecond: [-45, 45],
      renderPriority: 1000,
      depthTest: false,
      color: "#ffffff",
      intensity: 1.15,
      emission: { color: "#ff9dcc", intensity: 4 }
    },
    models: [
      {
        id: "pearl-cherry-tree",
        // One uniformly fitted source tree supplies the reference's dominant crown.
        scale: [198, 98, 166],
        footprint: [32, 27],
        groundingFootprint: [37, 32],
        grounded: true,
        // Highest vertex of the source root rims, so all cut openings enter the soil.
        assetGroundY: 1.0934512615203857,
        assetYawDegrees: -155,
        // The atlas is white RGB with an alpha silhouette. Use the source canopy
        // normals on both sides and keep the HDR pigment outside the overlay clamp.
        assetLeafMaterials: ["Foliage_PBR_512"],
        assetLeafColor: "#ff82a4",
        assetLeafIntensity: 1.6,
        assetLeafTextureBlend: 0,
        assetMaterials: {
          Bark_PBR_512: { color: "#f2e9e1", intensity: 1.1 }
        },
        assetUrl: new URL("../assets/pink-tree.glb", import.meta.url).href
      }
    ],
    // Vivid rose and fresh green retain their colour through the lit HDR pipeline.
    grass: ["#ff64a8", "#79c846"],
    ground: "#f0bfd6",
    road: "#dbbeaa",
    foliage: "#e6a0cb",
    treeFoliage: {
      SM_BirchTree_01: "#ff8ea0",
      SM_BirchTree_02: "#c179ed",
      SM_BirchTree_07: "#ff9fcb",
      "cartoon/tree/highlands-fir-3-candidate/v1": "#da96c7"
    },
    plantPalette: {
      layers: ["shrubs", "herbs", "cover", "flowers", "litter"],
      slots: {
        SM_Flower_08_01: {
          "appearance-540a4c6f542dc7f0": { color: "#ff006f", intensity: 20 }
        },
        SM_Flower_08_02: {
          "appearance-540a4c6f542dc7f0": { color: "#ff006b", intensity: 20 }
        },
        SM_Flower_08_03: {
          "appearance-540a4c6f542dc7f0": { color: "#ff0268", intensity: 20 }
        },
        SM_CoverPlant_06: {
          "appearance-d7b4b46b60c4bf96": { color: "#e01a56", intensity: 15 }
        },
        SM_BirchTree_01: sakuraBirchMaterials,
        SM_BirchTree_02: {
          "appearance-296c00a2f4125733": sakuraBirchMaterials["appearance-58da25ba7b394497"],
          "appearance-60463a2042d1d2fe": sakuraBirchMaterials["appearance-a8b3441a505dd0f2"],
          "appearance-e832df91cc4eb1a2": sakuraBirchMaterials["appearance-e832df91cc4eb1a2"]
        },
        SM_BirchTree_07: sakuraBirchMaterials
      },
      parts: {
        foliage: { color: "#66b83f", intensity: 1.1 },
        leaves: { color: "#93cf50", intensity: 1.1 },
        blades: { color: "#83c747", intensity: 1.1 },
        stem: { color: "#509633", intensity: 1.05 },
        petals: { color: "#ff75bd", intensity: 5 },
        cap: { color: "#f4b3cf", intensity: 1.35 },
        bark: { color: "#c5a3b0", intensity: 1 }
      },
      species: {
        // Native recipe inputs multiply the original material hue. This HDR swatch is
        // rose foliage / the evaluated blue base of highlands-bush-2-leaves.mat.
        "cartoon/shrub/highlands-bush-2/v1": { foliage: { color: "#ff414e", intensity: 9.26 } },
        SM_Flower_01_01: { petals: { color: "#fff0da", intensity: 4 } },
        SM_Flower_01_02: { petals: { color: "#fff0da", intensity: 4 } },
        SM_Flower_01_03: { petals: { color: "#fff0da", intensity: 4 } },
        SM_Flower_02_01: { petals: { color: "#ffb6d3", intensity: 4.5 } },
        SM_Flower_02_02: { petals: { color: "#ffb6d3", intensity: 4.5 } },
        SM_Flower_02_03: { petals: { color: "#ffb6d3", intensity: 4.5 } },
        SM_Flower_03_01: { petals: { color: "#c18aee", intensity: 6 } },
        SM_Flower_03_02: { petals: { color: "#c18aee", intensity: 6 } },
        SM_Flower_03_03: { petals: { color: "#c18aee", intensity: 6 } },
        SM_Flower_04_01: { petals: { color: "#e798d7", intensity: 5 } },
        SM_Flower_04_02: { petals: { color: "#e798d7", intensity: 5 } },
        SM_Flower_04_03: { petals: { color: "#e798d7", intensity: 5 } },
        SM_Flower_06_01: { petals: { color: "#ffd0ac", intensity: 4 } },
        SM_Flower_06_02: { petals: { color: "#ffd0ac", intensity: 4 } },
        SM_Flower_06_03: { petals: { color: "#ffd0ac", intensity: 4 } },
        SM_Flower_07_01: { petals: { color: "#ffa2c2", intensity: 4.5 } },
        SM_Flower_07_02: { petals: { color: "#ffa2c2", intensity: 4.5 } },
        SM_Flower_07_03: { petals: { color: "#ffa2c2", intensity: 4.5 } },
        SM_Flower_09_01: { petals: { color: "#b77ee8", intensity: 6 } },
        SM_Flower_09_02: { petals: { color: "#b77ee8", intensity: 6 } },
        SM_Flower_09_03: { petals: { color: "#b77ee8", intensity: 6 } },
        SM_Flower_10_01: { petals: { color: "#fff0da", intensity: 4 } },
        SM_Mushroom_01: { stem: { color: "#ffe4cf", intensity: 1.1 } },
        SM_Mushroom_02: { stem: { color: "#ffe4cf", intensity: 1.1 } },
        SM_Mushroom_03: { stem: { color: "#ffe4cf", intensity: 1.1 } },
        SM_Mushroom_04: { stem: { color: "#ffe4cf", intensity: 1.1 } },
        SM_Mushroom_05: { stem: { color: "#ffe4cf", intensity: 1.1 } },
        SM_Mushroom_06: { stem: { color: "#ffe4cf", intensity: 1.1 } },
        SM_Mushroom_07: { stem: { color: "#ffe4cf", intensity: 1.1 } },
        SM_Mushroom_08: { stem: { color: "#ffe4cf", intensity: 1.1 } },
        SM_Mushroom_09: { stem: { color: "#ffe4cf", intensity: 1.1 } },
        SM_Mushroom_10: { stem: { color: "#ffe4cf", intensity: 1.1 } },
        SM_Mushroom_11: { stem: { color: "#ffe4cf", intensity: 1.1 } },
        SM_Mushroom_12: { stem: { color: "#ffe4cf", intensity: 1.1 } }
      }
    },
    bark: "#e4dce8",
    flowers: "#fff4e8",
    stone: "#d2b9ca",
    lighting: {
      ...lighting(14.5, 2.5, 0.9, 1.1, 0.002, 0.55),
      ...atmosphere([0.22, 0.65, 1.8], [0.75, 1.05, 1.25]),
      iblIntensity: 0.85,
      fogExponent: 5,
      sunColorR: 1.06,
      sunColorG: 1,
      sunColorB: 0.98
    },
    postProcess: {
      ...post(10, 25),
      postExposure: 0.15,
      bloomThreshold: 1,
      bloomIntensity: 0.65
    },
    landscape: { treeHeightMinM: 4.5, treeHeightMaxM: 23 },
    initialLandscape: {
      "vegetation.shrubs": 0.5,
      "vegetation.herbs": 0.7,
      "vegetation.cover": 0.85,
      "vegetation.flowers": 1,
      "vegetation.litter": 0.45,
      "plantSizes.shrubs.scaleMin": 0.35,
      "plantSizes.shrubs.scaleMax": 0.82,
      "plantSizes.cover.scaleMin": 0.55,
      "plantSizes.cover.scaleMax": 0.95,
      "plantSizes.flowers.scaleMin": 0.85,
      "plantSizes.flowers.scaleMax": 1.3,
      "plantSizes.litter.scaleMin": 0.7,
      "plantSizes.litter.scaleMax": 1,
      roadsideDensityMultiplier: 8,
      grassRelativeHeight: 0.22,
      roadsideGrassHeightRatio: 0.4
    },
    flowerCoverage: 0.9,
    initialFlowers: { densityPerM2: 0.85 },
    weather: { cloudCoverage: 0.3, cloudBaseAltitudeM: 520, cloudFeatureSize: 0.72, rainRate: 0, snowRate: 0 }
  },
  "aurora-palace": {
    reference: "SeedWorld-02-aurora-ice-palace.png",
    focus: ["ice-cavern-shell"],
    frameFraction: 0.8,
    azimuthDegrees: 0,
    models: [
      model("central-ice-crystal", [8, 0, 36], [17, 33, 17]),
      model("ice-cavern-shell", [0, 0, 60], [124, 80, 110]),
      model("west-crystal-cluster", [-46, 0, -10], [13, 27, 12]),
      model("east-crystal-cluster", [50, 0, 8], [14, 38, 15])
    ],
    grass: ["#b2c9ef", "#edf4ff"],
    ground: "#d0e0f8",
    foliage: "#d9e9f5",
    bark: "#b6cedf",
    flowers: "#ffffff",
    stone: "#b3c9eb",
    lighting: {
      ...lighting(21.5, 0.12, 2.8, 1.1, 0.00045, 0.45),
      ...atmosphere([1, 1, 1], [1, 1, 1], [1.3, 1.25, 1.05], 0.55)
    },
    postProcess: post(6, 3, -3),
    terrain: [ridge("west-ice-wall", -110, 55, 330, 72, 65), ridge("east-ice-wall", 110, 55, 330, 72, 65)]
  },
  "emerald-forest": {
    modelLayout: "authored",
    spores: {
      count: 400,
      center: [0, 6, 15],
      extent: [64, 12, 120],
      radiusM: 0.005,
      minScreenFraction: 0.0015,
      color: "#e1ff8c",
      intensity: 16,
      driftM: 0.4,
      periodSeconds: 7
    },
    generation: {
      enabled: true,
      widthM: 180,
      frontDepthM: 100,
      backDepthM: 155,
      roadWidthM: 4.5,
      roadEndWidthRatio: 0.6,
      roadBendM: 5,
      roadWavelengthM: 95,
      destinationId: "giant-oak-distant-center",
      bankWidthM: 18,
      leftReliefM: 0,
      rightReliefM: 0,
      treeSpacingM: 18,
      treeBandWidthM: 36,
      treeAssetId: "SM_BirchTree_01",
      rockSpacingM: 12,
      rockWidthM: 5,
      rockDepthM: 4,
      rockHeightM: 2.5,
      replacePopulation: true
    },
    reference: "SeedWorld-03-emerald-rainforest.png",
    focus: ["giant-luminous-mushroom"],
    frameFraction: 0.86,
    azimuthDegrees: -5,
    lookAtOffset: [-8, 1.5, 0],
    models: [
      {
        ...forestMushroom("giant-luminous-mushroom", 12, 8, 20, -20),
        // The glowing gills illuminate the pale tissue and the companion cluster.
        light: { offset: [0, 0.12, 0], color: "#78ffe0", intensity: 0.9, rangeM: 26 }
      },
      forestMushroom("small-luminous-mushroom", 23, 9, 8, 30),
      forestMushroom("mushroom-front-companion", 7, -1, 6.5, -55),
      forestMushroom("mushroom-east-companion", 20, 19, 5, 85),
      forestMushroom("mushroom-root-cluster", 16, -2, 2.4, 125),
      forestMushroom("mushroom-west-foreground", -10, -24, 2, -15),
      forestMushroom("mushroom-west-small", -12, -22, 1.1, 45),
      forestMushroom("mushroom-east-foreground", 12, -25, 1.8, 90),
      forestMushroom("mushroom-east-small", 14, -23, 0.9, -50),
      forestMushroom("mushroom-trail-west", -7, 30, 1.4, 20),
      forestMushroom("mushroom-trail-east", 8, 43, 1.7, -60),
      forestOak("giant-oak-west-frame", -25, 0, 110, 20),
      forestOak("giant-oak-east-frame", 36, 21, 115, -35),
      forestOak("giant-oak-west-middle", -22, 62, 95, 85),
      forestOak("giant-oak-east-middle", 27, 78, 125, 140),
      forestOak("giant-oak-distant-center", -2, 133, 130, -70),
      forestOak("giant-oak-west-outer", -67, 65, 140, -25),
      forestOak("giant-oak-east-outer", 70, 95, 130, 65),
      forestOak("giant-oak-west-distance", -43, 153, 115, 120),
      forestOak("giant-oak-east-distance", 43, 185, 150, -100),
      forestFern("fern-west-foreground", -17, -16, 2.8, 20),
      forestFern("fern-east-foreground", 23, -18, 2.4, -40),
      forestFern("fern-west-bank", -19, 4, 3.8, 70),
      forestFern("fern-east-bank", 31, 11, 3.4, -65),
      forestFern("fern-mushroom-root", 21, 0, 1.6, 110),
      forestFern("fern-trail-west", -11, 28, 2, 45),
      forestFern("fern-trail-east", 14, 40, 2.2, -20),
      {
        ...model("fallen-forest-trunk", [-4, 7, 40], [48, 11, 11], false, -8),
        assetUrl: new URL("../assets/forest-fallen-trunk.glb", import.meta.url).href,
        assetMaterials: { SHD_trunk: { color: "#97ac64" } }
      },
      {
        ...model("canopy-sunbeams", [0, 45, 80], [130, 90, 90], false),
        assetUrl: new URL("../assets/forest-canopy-sunbeams.glb", import.meta.url).href,
        assetMaterials: { "Scattered canopy sunlight": { intensity: 1 } }
      }
    ],
    grass: ["#163c26", "#718f2e"],
    ground: "#49603c",
    road: "#9d9962",
    foliage: "#598b32",
    bark: "#706042",
    flowers: "#d4f7d9",
    stone: "#526c50",
    plantPalette: {
      layers: ["shrubs", "herbs", "cover", "flowers", "litter"],
      parts: {
        foliage: { color: "#668c39", intensity: 1 },
        leaves: { color: "#4e8135", intensity: 1 },
        stem: { color: "#47703a", intensity: 1 },
        petals: { color: "#e3ffe3", intensity: 1.2 },
        cap: { color: "#4ce9ba", intensity: 2 },
        bark: { color: "#6c6541", intensity: 1 }
      }
    },
    lighting: {
      ...lighting(10.3, 2.4, 1.2, 0.8, 0.009, 0.7),
      ...atmosphere([0.35, 0.72, 0.57], [0.64, 1.15, 0.84]),
      sunColorR: 1.1,
      sunColorG: 1.05,
      sunColorB: 0.72,
      fogTintR: 0.46,
      fogTintG: 0.95,
      fogTintB: 0.76
    },
    postProcess: { ...post(15, 9, -2), bloomThreshold: 0.65, bloomIntensity: 0.8, bloomScatter: 0.7 },
    landscape: {
      treeHeightMinM: 32,
      treeHeightMaxM: 55,
      grassRelativeHeight: 0.3
    },
    flowerCoverage: 0.08,
    weather: { cloudCoverage: 0, relativeHumidity: 0.7 },
    terrain: [ridge("west-forest-bank", -33, 24, 100, 22, 3), ridge("east-forest-bank", 30, 28, 110, 24, 4)]
  },
  "amethyst-ruins": {
    reference: "SeedWorld-04-amethyst-cosmic-ruins.png",
    focus: ["amethyst-temple"],
    frameFraction: 0.75,
    azimuthDegrees: 8,
    lookAtOffset: [10, 0, 0],
    models: [
      model("amethyst-temple", [-10, 0, 18], [45, 58, 35]),
      model("temple-crystal", [-12, 0, 28], [24, 67, 22]),
      model("east-floating-ruins", [85, 45, 95], [35, 42, 30], false),
      model("cosmic-whale", [100, 93, 155], [75, 22, 20], false),
      model("floating-jellyfish", [40, 20, -10], [12, 30, 12], false)
    ],
    grass: ["#684ba2", "#bd8cde"],
    ground: "#a599bd",
    foliage: "#9871cc",
    bark: "#77728d",
    flowers: "#e3a5ff",
    stone: "#9a8db4",
    lighting: {
      ...lighting(22, 0.12, 3.2, 0.8, 0.0005, 0.45),
      ...atmosphere([1, 1, 1], [1, 1, 1], [2.4, 0.5, 1.2], 0.65),
      fogTintR: 1.2,
      fogTintG: 0.8,
      fogTintB: 1.15
    },
    postProcess: post(9, 8),
    landscape: { treeHeightMinM: 7, treeHeightMaxM: 14 },
    flowerCoverage: 0.25,
    terrain: [plateau("ruin-terrace", 0, 25, 160, 130, 18)]
  },
  "cobalt-atlantis": {
    reference: "SeedWorld-05-cobalt-atlantis.png",
    focus: ["sapphire-temple"],
    frameFraction: 0.75,
    azimuthDegrees: -5,
    models: [
      model("sapphire-temple", [12, 0, 20], [42, 55, 36]),
      model("west-ruined-arch", [-37, 0, 5], [20, 31, 12]),
      model("east-ruined-column", [53, 0, 12], [8, 39, 8]),
      model("west-coral-reef", [-43, 0, -43], [23, 12, 22]),
      model("east-coral-reef", [44, 0, -34], [22, 14, 20])
    ],
    grass: ["#125b91", "#258ec3"],
    ground: "#7cbacb",
    foliage: "#197799",
    bark: "#3d6f91",
    flowers: "#5cc9ed",
    stone: "#4e9ec5",
    lighting: {
      ...lighting(11.5, 2, 1.7, 1.1, 0.005, 0.35),
      ...atmosphere([0.22, 0.9, 1.8], [0.28, 1.2, 1.7]),
      sunColorR: 0.25,
      sunColorG: 1.05,
      sunColorB: 1.65,
      fogTintR: 0.18,
      fogTintG: 1.05,
      fogTintB: 1.7
    },
    postProcess: post(8, 10, -3),
    terrain: [ridge("west-reef", -110, 45, 300, 70, 28), ridge("east-reef", 115, 65, 320, 75, 35)],
    support: "submerged",
    water: [{ id: "atlantis-water", x: 0, z: 0, radius: 280, depth: 75, color: [42, 115, 151] }]
  },
  "golden-palace": {
    reference: "SeedWorld-06-golden-sun-palace.png",
    focus: ["sacred-chalice", "golden-colonnade"],
    frameFraction: 0.75,
    azimuthDegrees: -12,
    lookAtOffset: [-10, 0, 0],
    models: [model("golden-colonnade", [21, 0, 25], [58, 53, 35]), model("sacred-chalice", [6, 0, -3], [9, 12, 9])],
    grass: ["#9d833f", "#d2b963"],
    ground: "#f0d6a6",
    foliage: "#cba552",
    bark: "#92704d",
    flowers: "#ffe4a3",
    stone: "#d4c5b1",
    lighting: {
      ...lighting(17.3, 2, 1.4, 1.5, 0.00035, 0.55),
      ...atmosphere([2.3, 1.1, 0.8], [2.2, 1.2, 0.75]),
      sunColorR: 1.25,
      sunColorG: 1.05,
      sunColorB: 0.85,
      sunSize: 0.035,
      fogTintR: 1.2,
      fogTintG: 1,
      fogTintB: 0.85
    },
    postProcess: post(9, 4, 1),
    landscape: { treeHeightMinM: 7, treeHeightMaxM: 14 },
    flowerCoverage: 0.12,
    terrain: [plateau("temple-terrace", 20, 35, 190, 120, 15)]
  },
  "crimson-torii": {
    reference: "SeedWorld-07-crimson-torii-eclipse.png",
    focus: ["great-torii", "suspended-bell"],
    frameFraction: 0.75,
    azimuthDegrees: -10,
    lookAtOffset: [12, 0, 0],
    models: [
      model("great-torii", [-8, 0, 12], [35, 35, 8]),
      model("suspended-bell", [-8, 17, 10], [10, 16, 10], false),
      model("distant-torii", [45, 0, 95], [16, 18, 4]),
      model("eclipse-disc", [70, 120, 200], [80, 80, 4], false)
    ],
    grass: ["#9d2534", "#e45649"],
    ground: "#a3918d",
    foliage: "#d02c36",
    bark: "#543a43",
    flowers: "#ef6552",
    stone: "#7e778d",
    lighting: {
      ...lighting(18.4, 1.5, 2.1, 1.1, 0.0007, 0.6),
      ...atmosphere([5, 0.6, 0.24], [3.2, 0.8, 0.4], [1.5, 0.6, 0.65], 0.2),
      sunColorR: 1.5,
      sunColorG: 0.65,
      sunColorB: 0.5,
      fogTintR: 1.4,
      fogTintG: 0.65,
      fogTintB: 0.8
    },
    postProcess: post(10, 9),
    landscape: { treeHeightMinM: 8, treeHeightMaxM: 18 },
    terrain: [ridge("west-canyon", -150, 100, 360, 85, 90), ridge("east-canyon", 170, 110, 380, 100, 110)]
  },
  "cyber-void": {
    reference: "SeedWorld-08-obsidian-cyber-void.png",
    focus: ["mechanical-cube"],
    frameFraction: 0.75,
    azimuthDegrees: 0,
    models: [
      model("mechanical-cube", [0, 32, 0], [35, 44, 35], false),
      model("west-obsidian-pillar", [-39, 0, -2], [6, 17, 6]),
      model("east-obsidian-pillar", [39, 0, -2], [6, 17, 6])
    ],
    grass: ["#161820", "#2b2e3c"],
    ground: "#252839",
    foliage: "#38404c",
    bark: "#30343d",
    flowers: "#7798a3",
    stone: "#37394c",
    lighting: {
      ...lighting(23.2, 0.03, 2, 0.13, 0.0007, 0.55),
      ...atmosphere([1, 1, 1], [1, 1, 1], [1.1, 0.9, 1.1], 0.12),
      starIntensity: 0.2
    },
    postProcess: post(10),
    terrain: []
  },
  "voxel-arcade": {
    reference: "SeedWorld-10-voxel-arcade-world.png",
    focus: ["giant-voxel-arcade"],
    frameFraction: 0.75,
    azimuthDegrees: -8,
    models: [
      model("giant-voxel-arcade", [0, 0, 15], [28, 40, 23]),
      model("west-arcade-machine", [-23, 0, -12], [5, 7, 4]),
      model("east-arcade-machine", [24, 0, -8], [5, 7, 4]),
      model("voxel-spaceship", [34, 0, -31], [12, 8, 10])
    ],
    grass: ["#32983b", "#a2ca42"],
    ground: "#c5c8c4",
    foliage: "#408d35",
    bark: "#8e785c",
    flowers: "#e6b5e5",
    stone: "#b9c4ce",
    lighting: {
      ...lighting(11, 2, 1.5, 1.3, 0.00025, 0.6),
      ...atmosphere([0.765, 1.6, 1.6], [0.95, 1.15, 1.25]),
      skyTintR: 0.557,
      skyTintG: 0.626,
      skyTintB: 0.747,
      sunColorR: 1.05,
      sunColorG: 1.03,
      sunColorB: 1
    },
    postProcess: post(12, 12),
    flowerCoverage: 0.3,
    landscape: { treeHeightMinM: 5, treeHeightMaxM: 10 }
  },
  "cosmic-islets": {
    reference: "SeedWorld-11-cosmic-islets.png",
    focus: ["foreground-stone-arch"],
    frameFraction: 0.65,
    azimuthDegrees: 0,
    lookAtOffset: [20, 0, 0],
    models: [
      model("foreground-stone-arch", [-20, 0, 5], [18, 28, 8]),
      model("east-floating-island", [92, 30, 110], [50, 42, 45], false),
      model("distant-floating-island", [-77, 56, 140], [34, 32, 30], false),
      model("cosmic-whale", [90, 110, 200], [95, 26, 24], false)
    ],
    grass: ["#4d8749", "#99b967"],
    ground: "#a7b0b5",
    foliage: "#688c69",
    bark: "#7b7e8c",
    flowers: "#c5e4dd",
    stone: "#9aabc2",
    lighting: {
      ...lighting(22.4, 0.08, 3.4, 0.8, 0.00045, 0.45),
      ...atmosphere([1, 1, 1], [1, 1, 1], [1.45, 0.65, 1.25], 0.7)
    },
    postProcess: post(8, 7),
    flowerCoverage: 0.35,
    landscape: { treeHeightMinM: 7, treeHeightMaxM: 13 }
  },
  "neon-alley": {
    reference: "SeedWorld-12-cyberpunk-alley.png",
    focus: ["west-street-facade", "east-street-facade"],
    frameFraction: 0.8,
    azimuthDegrees: 0,
    models: [
      model("west-street-facade", [-25, 0, 15], [22, 38, 65]),
      model("east-street-facade", [25, 0, 22], [22, 44, 65]),
      model("overhead-street-bridge", [0, 20, 43], [32, 7, 10], false),
      model("vending-machine", [-18, 0, -24], [6, 10, 5])
    ],
    grass: ["#31595e", "#597f7b"],
    ground: "#52638b",
    foliage: "#4b806c",
    bark: "#53677b",
    flowers: "#d399c9",
    stone: "#667b9c",
    lighting: {
      ...lighting(20.4, 0.2, 3.2, 0.65, 0.0008, 0.5),
      ...atmosphere([1, 1, 1], [1, 1, 1], [1.6, 1.1, 1.4], 0.7),
      fogTintR: 1.15,
      fogTintG: 0.9,
      fogTintB: 1.3
    },
    postProcess: post(9, 10),
    flowerCoverage: 0.12,
    landscape: { treeHeightMinM: 5, treeHeightMaxM: 10 },
    weather: { cloudCoverage: 0.65, rainRate: 0.28, temperatureCelsius: 14, relativeHumidity: 0.85 }
  },
  "titan-wasteland": {
    reference: "SeedWorld-13-titan-wasteland.png",
    grassGroundFusion: false,
    initialPlanning: {
      landMode: "continuous",
      relief: { reliefNearAmplitudeM: 8, reliefAmplitudeM: 26, reliefFarAmplitudeM: 76, reliefScaleM: 256 },
      roadsEnabled: false,
      farmingEnabled: false,
      poiMemberMax: 0,
      population: { villageMin: 0, villageMax: 0, buildingMin: 0, buildingMax: 0 }
    },
    plannedSubjects: true,
    centeredStart: true,
    focus: ["ancient-mech-wreck", "broken-stone-arch"],
    frameFraction: 0.85,
    azimuthDegrees: -7,
    lookAtOffset: [0, -22, 0],
    models: [
      {
        ...model("ancient-mech-wreck", [64, 0, 313], [230, 186, 278]),
        label: "巨兽",
        assetUrl: "https://mdn.alipayobjects.com/rms/afts/file/A*WzQ9Q6me6W8AAAAAgGAAAAgAehQnAQ/jushou.glb"
      },
      {
        ...model("broken-stone-arch", [-104, 0, 212], [64, 62, 22], true, 12),
        label: "断壁残垣",
        assetUrl: "https://mdn.alipayobjects.com/rms/afts/file/A*E1bHTKH2busAAAAAgBAAAAgAehQnAQ/shitou2.glb"
      }
    ],
    lighting: { timeHours: 12 },
    postProcess: { contrast: 0 },
    landscape: { treeHeightMinM: 5, treeHeightMaxM: 12 },
    flowerCoverage: 0,
    initialLandscape: {
      density: 0,
      companionStoneDensity: 0,
      "vegetation.trees": 0,
      "vegetation.grass": 0,
      "vegetation.shrubs": 0,
      "vegetation.herbs": 0,
      "vegetation.cover": 0,
      "vegetation.flowers": 0,
      "vegetation.litter": 0
    }
  },
  "luminous-abyss": {
    reference: "SeedWorld-14-bioluminescent-abyss.png",
    focus: ["great-jellyfish"],
    frameFraction: 0.75,
    azimuthDegrees: 0,
    models: [
      model("great-jellyfish", [-5, 24, 5], [25, 44, 25], false),
      model("west-jellyfish", [-40, 18, 22], [18, 32, 18], false),
      model("east-jellyfish", [32, 20, 32], [18, 34, 18], false),
      model("sunken-ship", [65, 0, 70], [64, 31, 25], true, -20),
      model("west-coral-reef", [-48, 0, -35], [24, 14, 20]),
      model("east-coral-reef", [45, 0, -24], [22, 12, 23])
    ],
    grass: ["#155b83", "#338e9f"],
    ground: "#6d9ead",
    foliage: "#24747e",
    bark: "#3c637d",
    flowers: "#80c6e9",
    stone: "#467a9c",
    lighting: {
      ...lighting(11.8, 1.7, 1.6, 1, 0.006, 0.3),
      ...atmosphere([0.18, 0.9, 1.8], [0.25, 1.1, 1.7]),
      sunColorR: 0.22,
      sunColorG: 0.95,
      sunColorB: 1.6,
      fogTintR: 0.18,
      fogTintG: 0.9,
      fogTintB: 1.6
    },
    postProcess: post(9, 10, -3),
    terrain: [ridge("west-seabed", -110, 70, 350, 70, 22), ridge("east-seabed", 125, 100, 370, 80, 30)],
    support: "submerged",
    water: [{ id: "abyss-water", x: 0, z: 0, radius: 280, depth: 70, color: [28, 93, 126] }]
  },
  "aurora-glacier": {
    reference: "SeedWorld-15-aurora-glacier.png",
    focus: ["great-glacier-arch"],
    frameFraction: 0.7,
    azimuthDegrees: 0,
    models: [
      model("great-glacier-arch", [5, 0, 35], [100, 67, 30]),
      model("west-crystal-cluster", [-63, 0, -35], [18, 34, 18]),
      model("east-crystal-cluster", [65, 0, -4], [19, 28, 20]),
      model("aurora-dragon", [15, 115, 150], [175, 30, 22], false)
    ],
    grass: ["#a9d8e9", "#e4f5ff"],
    ground: "#b9e0ee",
    foliage: "#c1e0e5",
    bark: "#c3d4df",
    flowers: "#e6fbff",
    stone: "#9acddd",
    lighting: {
      ...lighting(22, 0.1, 2.8, 0.7, 0.0004, 0.4),
      ...atmosphere([1, 1, 1], [1, 1, 1], [0.8, 1.8, 1.3], 0.65)
    },
    postProcess: post(7, 7, -2),
    terrain: [ridge("west-glacier", -155, 80, 400, 100, 43), ridge("east-glacier", 165, 100, 400, 105, 50)]
  }
};
